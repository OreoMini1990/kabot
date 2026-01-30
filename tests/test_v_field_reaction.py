#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v 필드에서 반응 데이터를 제대로 가져오는지 테스트
- v 필드 조회
- defaultEmoticonsCount 추출
- v 필드 구조 분석
"""

import sys
import os
import sqlite3
import json
import time

# DB 경로
DB_PATH = "/data/data/com.kakao.talk/databases/KakaoTalk.db"
DB_PATH2 = "/data/data/com.kakao.talk/databases/KakaoTalk2.db"

def test_v_field_reaction():
    """v 필드에서 반응 데이터 추출 테스트"""
    print("=" * 80)
    print("v 필드 반응 데이터 추출 테스트")
    print("=" * 80)
    print()
    
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] DB 파일을 찾을 수 없습니다: {DB_PATH}")
        print("[INFO] Android 기기에서 실행하거나 DB 파일 경로를 수정하세요.")
        return
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # db2 attach
        db2_attached = False
        if os.path.exists(DB_PATH2):
            try:
                cursor.execute(f"ATTACH DATABASE '{DB_PATH2}' AS db2")
                db2_attached = True
                print("[OK] db2 attach 성공")
            except Exception as e:
                print(f"[WARNING] db2 attach 실패: {e}")
        
        print()
        
        # 최근 24시간 내 메시지 조회 (v 필드 포함)
        twenty_four_hours_ago = int(time.time() * 1000) - (24 * 60 * 60 * 1000)
        
        query = """
            SELECT _id, chat_id, user_id, v, supplement, created_at, message, type
            FROM chat_logs
            WHERE created_at > ?
            ORDER BY _id DESC
            LIMIT 200
        """
        
        print(f"[1] 최근 24시간 내 메시지 조회 중...")
        cursor.execute(query, (twenty_four_hours_ago,))
        messages = cursor.fetchall()
        
        print(f"[OK] {len(messages)}개 메시지 조회 완료")
        print()
        
        # 통계
        total_messages = len(messages)
        messages_with_v = 0
        messages_with_v_json = 0
        messages_with_reaction = 0
        messages_with_supplement = 0
        
        # v 필드 샘플 저장
        v_field_samples = []
        reaction_samples = []
        
        print("=" * 80)
        print("[2] v 필드 분석 시작")
        print("=" * 80)
        print()
        
        for idx, msg in enumerate(messages):
            msg_id = msg[0]
            chat_id = msg[1]
            user_id = msg[2]
            v_field = msg[3] if len(msg) > 3 else None
            supplement = msg[4] if len(msg) > 4 else None
            created_at = msg[5] if len(msg) > 5 else None
            message = msg[6] if len(msg) > 6 else None
            msg_type = msg[7] if len(msg) > 7 else None
            
            # v 필드 존재 여부 확인
            if v_field is not None:
                messages_with_v += 1
                
                # v 필드 파싱 시도
                v_json = None
                try:
                    if isinstance(v_field, str):
                        v_json = json.loads(v_field)
                    elif isinstance(v_field, dict):
                        v_json = v_field
                    else:
                        v_json = None
                    
                    if v_json is not None:
                        messages_with_v_json += 1
                        
                        # v 필드 구조 확인 (처음 10개만 상세 출력)
                        if idx < 10:
                            print(f"[샘플 {idx+1}] msg_id={msg_id}")
                            print(f"  v 필드 타입: {type(v_field).__name__}")
                            print(f"  v 필드 파싱 성공: {isinstance(v_json, dict)}")
                            if isinstance(v_json, dict):
                                print(f"  v 필드 키: {list(v_json.keys())[:20]}")
                            print()
                        
                        # defaultEmoticonsCount 확인
                        if isinstance(v_json, dict):
                            reaction_count = v_json.get("defaultEmoticonsCount", 0)
                            
                            if reaction_count > 0:
                                messages_with_reaction += 1
                                
                                # 반응이 있는 메시지 상세 정보
                                reaction_samples.append({
                                    'msg_id': msg_id,
                                    'chat_id': chat_id,
                                    'user_id': user_id,
                                    'reaction_count': reaction_count,
                                    'v_field': v_json,
                                    'supplement': supplement,
                                    'message': message,
                                    'type': msg_type,
                                    'created_at': created_at
                                })
                                
                                # 처음 5개 반응 메시지만 상세 출력
                                if len(reaction_samples) <= 5:
                                    print(f"[반응 발견 {len(reaction_samples)}] msg_id={msg_id}")
                                    print(f"  defaultEmoticonsCount: {reaction_count}")
                                    print(f"  v 필드 전체 구조:")
                                    print(f"    {json.dumps(v_json, indent=2, ensure_ascii=False)[:500]}...")
                                    if supplement:
                                        print(f"  supplement 존재: {bool(supplement)}")
                                        try:
                                            supp_json = json.loads(supplement) if isinstance(supplement, str) else supplement
                                            if isinstance(supp_json, dict):
                                                print(f"  supplement 키: {list(supp_json.keys())[:10]}")
                                                if "reactions" in supp_json:
                                                    print(f"  supplement.reactions: {len(supp_json['reactions']) if isinstance(supp_json['reactions'], list) else 'N/A'}개")
                                                if "emoticons" in supp_json:
                                                    print(f"  supplement.emoticons: {len(supp_json['emoticons']) if isinstance(supp_json['emoticons'], list) else 'N/A'}개")
                                        except:
                                            pass
                                    print()
                        
                        # v 필드 샘플 저장 (처음 10개)
                        if len(v_field_samples) < 10:
                            v_field_samples.append({
                                'msg_id': msg_id,
                                'v_field_type': type(v_field).__name__,
                                'v_field': v_field if isinstance(v_field, str) else json.dumps(v_field, ensure_ascii=False),
                                'v_json': v_json if isinstance(v_json, dict) else None
                            })
                except (json.JSONDecodeError, TypeError) as e:
                    if idx < 5:
                        print(f"[파싱 실패 {idx+1}] msg_id={msg_id}, 오류={e}")
                        print(f"  v_field 타입: {type(v_field)}")
                        print(f"  v_field 값 (처음 200자): {str(v_field)[:200] if v_field else 'None'}...")
                        print()
            
            # supplement 필드 확인
            if supplement is not None:
                messages_with_supplement += 1
        
        print()
        print("=" * 80)
        print("[3] 통계 결과")
        print("=" * 80)
        print()
        print(f"전체 메시지: {total_messages}개")
        print(f"v 필드 존재: {messages_with_v}개 ({messages_with_v/total_messages*100:.1f}%)")
        print(f"v 필드 JSON 파싱 성공: {messages_with_v_json}개 ({messages_with_v_json/total_messages*100:.1f}%)")
        print(f"반응 있는 메시지 (defaultEmoticonsCount > 0): {messages_with_reaction}개 ({messages_with_reaction/total_messages*100:.1f}%)")
        print(f"supplement 필드 존재: {messages_with_supplement}개 ({messages_with_supplement/total_messages*100:.1f}%)")
        print()
        
        # 반응 메시지 상세 분석
        if reaction_samples:
            print("=" * 80)
            print(f"[4] 반응 메시지 상세 분석 ({len(reaction_samples)}개)")
            print("=" * 80)
            print()
            
            for idx, sample in enumerate(reaction_samples[:10], 1):
                print(f"[반응 메시지 {idx}]")
                print(f"  msg_id: {sample['msg_id']}")
                print(f"  chat_id: {sample['chat_id']}")
                print(f"  user_id: {sample['user_id']}")
                print(f"  defaultEmoticonsCount: {sample['reaction_count']}")
                print(f"  message: {str(sample['message'])[:50] if sample['message'] else 'None'}...")
                print(f"  type: {sample['type']}")
                
                # v 필드의 모든 키 출력
                if isinstance(sample['v_field'], dict):
                    print(f"  v 필드 키: {list(sample['v_field'].keys())}")
                    # 주요 필드 값 출력
                    for key in ['defaultEmoticonsCount', 'enc', 'isMine', 'origin']:
                        if key in sample['v_field']:
                            print(f"    v.{key}: {sample['v_field'][key]}")
                
                # supplement 분석
                if sample['supplement']:
                    try:
                        supp_json = json.loads(sample['supplement']) if isinstance(sample['supplement'], str) else sample['supplement']
                        if isinstance(supp_json, dict):
                            print(f"  supplement 키: {list(supp_json.keys())[:10]}")
                            if "reactions" in supp_json:
                                reactions = supp_json["reactions"]
                                if isinstance(reactions, list):
                                    print(f"  supplement.reactions: {len(reactions)}개")
                                    for react_idx, react in enumerate(reactions[:3], 1):
                                        if isinstance(react, dict):
                                            print(f"    반응 {react_idx}: {react}")
                            if "emoticons" in supp_json:
                                emoticons = supp_json["emoticons"]
                                if isinstance(emoticons, list):
                                    print(f"  supplement.emoticons: {len(emoticons)}개")
                    except Exception as e:
                        print(f"  supplement 파싱 실패: {e}")
                
                print()
        else:
            print("[4] 반응이 있는 메시지가 없습니다.")
            print()
        
        # v 필드 샘플 출력
        if v_field_samples:
            print("=" * 80)
            print("[5] v 필드 샘플 (처음 5개)")
            print("=" * 80)
            print()
            
            for idx, sample in enumerate(v_field_samples[:5], 1):
                print(f"[샘플 {idx}] msg_id={sample['msg_id']}")
                print(f"  v_field 타입: {sample['v_field_type']}")
                if sample['v_json']:
                    print(f"  v 필드 키: {list(sample['v_json'].keys())[:15]}")
                    print(f"  v 필드 값 (처음 300자):")
                    v_str = json.dumps(sample['v_json'], indent=2, ensure_ascii=False)
                    print(f"    {v_str[:300]}...")
                else:
                    print(f"  v_field 값 (처음 200자): {sample['v_field'][:200]}...")
                print()
        
        # 클라이언트 로직과 동일한 방식으로 추출 테스트
        print("=" * 80)
        print("[6] 클라이언트 로직 시뮬레이션 테스트")
        print("=" * 80)
        print()
        
        success_count = 0
        fail_count = 0
        
        for msg in messages[:50]:  # 처음 50개만 테스트
            msg_id = msg[0]
            v_field = msg[3] if len(msg) > 3 else None
            
            # 클라이언트의 poll_reaction_updates() 로직과 동일
            current_reaction_count = 0
            extraction_success = False
            
            if v_field:
                try:
                    if isinstance(v_field, str):
                        v_json = json.loads(v_field)
                    else:
                        v_json = v_field
                    
                    if isinstance(v_json, dict):
                        current_reaction_count = v_json.get("defaultEmoticonsCount", 0)
                        extraction_success = True
                except (json.JSONDecodeError, TypeError) as e:
                    extraction_success = False
            
            if extraction_success:
                success_count += 1
            else:
                fail_count += 1
        
        print(f"추출 성공: {success_count}개")
        print(f"추출 실패: {fail_count}개")
        print(f"성공률: {success_count/(success_count+fail_count)*100:.1f}%")
        print()
        
        print("=" * 80)
        print("테스트 완료")
        print("=" * 80)
        
        conn.close()
        
    except Exception as e:
        print(f"[ERROR] 테스트 실패: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_v_field_reaction()

