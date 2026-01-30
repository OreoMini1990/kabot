#!/usr/bin/env python3
"""
카카오톡 DB 파일을 서버로 업로드하는 스크립트
Termux에서 실행: python b.py
"""
import os
import sys
import requests
from datetime import datetime
import hashlib

# 서버 URL
HTTP_URL = "http://192.168.0.15:5002"

# 카카오톡 DB 경로
DB_PATH = "/data/data/com.kakao.talk/databases/KakaoTalk.db"
DB_PATH2 = "/data/data/com.kakao.talk/databases/KakaoTalk2.db"

def calculate_file_hash(file_path):
    """파일의 SHA256 해시 계산"""
    sha256_hash = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    except Exception as e:
        print(f"[오류] 파일 해시 계산 실패: {e}")
        return None

def upload_db_file(db_path, db_name):
    """DB 파일을 서버로 업로드"""
    if not os.path.exists(db_path):
        print(f"[경고] DB 파일이 없습니다: {db_path}")
        return False
    
    try:
        # 파일 정보
        file_size = os.path.getsize(db_path)
        file_hash = calculate_file_hash(db_path)
        file_mtime = os.path.getmtime(db_path)
        file_mtime_str = datetime.fromtimestamp(file_mtime).strftime('%Y-%m-%d %H:%M:%S')
        
        print(f"\n[업로드 시작] {db_name}")
        print(f"  경로: {db_path}")
        print(f"  크기: {file_size / (1024*1024):.2f} MB")
        print(f"  수정 시간: {file_mtime_str}")
        print(f"  해시: {file_hash[:16]}...")
        
        # 파일 업로드
        upload_url = f"{HTTP_URL}/api/upload-db"
        
        with open(db_path, 'rb') as f:
            files = {
                'db_file': (os.path.basename(db_path), f, 'application/x-sqlite3')
            }
            data = {
                'db_name': db_name,
                'file_size': str(file_size),
                'file_hash': file_hash,
                'file_mtime': str(file_mtime)
            }
            
            print(f"\n[전송 중] 서버로 업로드 중...")
            response = requests.post(upload_url, files=files, data=data, timeout=300)
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print(f"[✓] 업로드 성공: {db_name}")
                print(f"  서버 경로: {result.get('file_path', 'N/A')}")
                return True
            else:
                print(f"[✗] 업로드 실패: {result.get('error', '알 수 없는 오류')}")
                return False
        else:
            print(f"[✗] 업로드 실패: HTTP {response.status_code}")
            try:
                error_msg = response.json().get('error', response.text)
                print(f"  오류: {error_msg}")
            except:
                print(f"  응답: {response.text[:200]}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"[✗] 네트워크 오류: {e}")
        return False
    except Exception as e:
        print(f"[✗] 업로드 오류: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    """메인 함수"""
    print("=" * 60)
    print("카카오톡 DB 파일 업로드 스크립트")
    print(f"서버: {HTTP_URL}")
    print("=" * 60)
    
    # DB 파일 확인
    db_files = []
    
    if os.path.exists(DB_PATH):
        db_files.append((DB_PATH, "KakaoTalk.db"))
    else:
        print(f"[경고] KakaoTalk.db를 찾을 수 없습니다: {DB_PATH}")
    
    if os.path.exists(DB_PATH2):
        db_files.append((DB_PATH2, "KakaoTalk2.db"))
    else:
        print(f"[경고] KakaoTalk2.db를 찾을 수 없습니다: {DB_PATH2}")
    
    if not db_files:
        print("\n[오류] 업로드할 DB 파일이 없습니다.")
        print("\n[해결 방법]")
        print("1. DB 파일 경로 확인:")
        print("   ls -la /data/data/com.kakao.talk/databases/")
        print("2. 스크립트의 DB_PATH를 실제 파일 이름으로 수정")
        return
    
    # 각 DB 파일 업로드
    success_count = 0
    for db_path, db_name in db_files:
        if upload_db_file(db_path, db_name):
            success_count += 1
        print()
    
    # 결과 요약
    print("=" * 60)
    print(f"업로드 완료: {success_count}/{len(db_files)}개 파일")
    print("=" * 60)
    
    if success_count == len(db_files):
        print("[✓] 모든 파일 업로드 성공!")
    else:
        print("[✗] 일부 파일 업로드 실패")

if __name__ == "__main__":
    main()

