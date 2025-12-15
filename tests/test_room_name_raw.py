#!/usr/bin/env python3
"""
Raw 메시지 데이터로 채팅방 이름 조회 및 복호화 테스트
실제 DB 파일 없이 raw 메시지 JSON 데이터로 테스트
"""
import json
import sys
import os

# kakaodecrypt 모듈 import (선택적)
KAKAODECRYPT_AVAILABLE = False
KakaoDecrypt = None

try:
    # 먼저 Crypto 모듈 확인
    try:
        from Crypto.Cipher import AES
        CRYPTO_AVAILABLE = True
    except ImportError:
        CRYPTO_AVAILABLE = False
        print("[경고] Crypto 모듈을 찾을 수 없습니다.")
        print("[해결] pip install pycryptodome 실행 (가상환경 활성화 확인)")
    
    if CRYPTO_AVAILABLE:
        # 현재 스크립트의 디렉토리 기준으로 client 디렉토리 찾기
        script_dir = os.path.dirname(os.path.abspath(__file__))
        client_dir = os.path.join(script_dir, '..', 'client')
        client_dir = os.path.abspath(client_dir)
        
        if client_dir not in sys.path:
            sys.path.insert(0, client_dir)
        
        from kakaodecrypt import KakaoDecrypt
        KAKAODECRYPT_AVAILABLE = True
        print(f"[정보] kakaodecrypt 모듈 로드 성공: {client_dir}")
except ImportError as e:
    print(f"[경고] kakaodecrypt 모듈을 찾을 수 없습니다: {e}")
    KAKAODECRYPT_AVAILABLE = False
    KakaoDecrypt = None

def test_room_name_from_raw_message(raw_message_json, my_user_id):
    """
    Raw 메시지 JSON에서 채팅방 이름 추출 및 복호화 테스트
    
    Args:
        raw_message_json: Raw 메시지 JSON 데이터 (dict 또는 JSON 문자열)
        my_user_id: 자신의 user_id (복호화에 사용)
    """
    print(f"\n{'='*60}")
    print(f"[테스트] Raw 메시지에서 채팅방 이름 추출 및 복호화")
    print(f"{'='*60}")
    
    # JSON 파싱
    if isinstance(raw_message_json, str):
        try:
            message_data = json.loads(raw_message_json)
        except json.JSONDecodeError as e:
            print(f"[오류] JSON 파싱 실패: {e}")
            return None
    else:
        message_data = raw_message_json
    
    print(f"[정보] 메시지 데이터 키: {list(message_data.keys()) if isinstance(message_data, dict) else 'N/A'}")
    
    # chat_id 추출
    chat_id = message_data.get('chat_id') or message_data.get('chatId')
    if not chat_id:
        print("[오류] chat_id를 찾을 수 없습니다.")
        return None
    
    print(f"[정보] chat_id: {chat_id}")
    print(f"[정보] my_user_id: {my_user_id}")
    
    # 방법 1: json.room_data 또는 json.room_name에서 채팅방 이름 추출
    json_data = message_data.get('json', {})
    if isinstance(json_data, str):
        try:
            json_data = json.loads(json_data)
        except:
            pass
    
    # room_data에서 private_meta 추출 시도
    room_data = json_data.get('room_data') or json_data.get('roomData')
    if room_data:
        print(f"\n[방법 1] room_data에서 채팅방 이름 추출 시도")
        if isinstance(room_data, str):
            try:
                room_data = json.loads(room_data)
            except:
                pass
        
        private_meta_str = None
        if isinstance(room_data, dict):
            private_meta_str = room_data.get('private_meta') or room_data.get('privateMeta')
        
        if private_meta_str:
            print(f"[방법 1] private_meta 발견: 길이={len(private_meta_str) if isinstance(private_meta_str, str) else 'N/A'}")
            return test_room_name_from_private_meta(private_meta_str, my_user_id)
    
    # 방법 2: json.room_name에서 직접 추출
    room_name_raw = json_data.get('room_name') or json_data.get('roomName')
    if room_name_raw:
        print(f"\n[방법 2] json.room_name에서 채팅방 이름 추출 시도")
        print(f"[방법 2] room_name_raw: {room_name_raw}, 타입={type(room_name_raw)}")
        return test_room_name_decrypt(room_name_raw, my_user_id, json_data)
    
    # 방법 3: room 필드에서 추출
    room = message_data.get('room')
    if room and room != str(chat_id):
        print(f"\n[방법 3] room 필드에서 채팅방 이름 추출 시도")
        print(f"[방법 3] room: {room}, 타입={type(room)}")
        return test_room_name_decrypt(room, my_user_id, json_data)
    
    print(f"\n[✗] 채팅방 이름을 찾을 수 없음")
    return None

def test_room_name_from_private_meta(private_meta_str, my_user_id):
    """private_meta JSON 문자열에서 채팅방 이름 추출 및 복호화"""
    try:
        private_meta = json.loads(private_meta_str)
        print(f"[private_meta] JSON 파싱 성공: 키={list(private_meta.keys()) if isinstance(private_meta, dict) else 'N/A'}")
        
        # Iris: name.jsonPrimitive.content
        name_element = private_meta.get('name')
        print(f"[private_meta] name 필드 추출: name_element={name_element}, 타입={type(name_element)}")
        
        if name_element is not None:
            if isinstance(name_element, str):
                room_name_raw = name_element
            elif isinstance(name_element, dict):
                room_name_raw = name_element.get('content') or name_element.get('value') or str(name_element)
            else:
                room_name_raw = str(name_element)
            
            print(f"[private_meta] room_name_raw 추출: {room_name_raw}, 길이={len(room_name_raw) if isinstance(room_name_raw, str) else 'N/A'}")
            
            # 복호화 시도
            enc_candidates = [31, 32, 30]
            if 'enc' in private_meta:
                enc_from_meta = private_meta['enc']
                if isinstance(enc_from_meta, (int, str)):
                    enc_candidates.insert(0, int(enc_from_meta))
                    print(f"[private_meta] enc 추출: {enc_from_meta}")
            
            return test_room_name_decrypt(room_name_raw, my_user_id, {'enc': enc_candidates[0] if enc_candidates else 31})
    except json.JSONDecodeError as e:
        print(f"[오류] private_meta JSON 파싱 실패: {e}")
        return None

def test_room_name_decrypt(room_name_raw, my_user_id, json_data=None):
    """채팅방 이름 복호화 테스트"""
    if not isinstance(room_name_raw, str):
        room_name_raw = str(room_name_raw)
    
    print(f"[복호화 테스트] room_name_raw: \"{room_name_raw}\", 길이={len(room_name_raw)}")
    
    # base64로 보이는지 확인
    is_base64_like = (len(room_name_raw) > 10 and 
                     len(room_name_raw) % 4 == 0 and
                     all(c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' for c in room_name_raw))
    
    if not is_base64_like:
        print(f"[결과] 채팅방 이름 (일반 텍스트): \"{room_name_raw}\"")
        return room_name_raw
    
    print(f"[복호화 테스트] 암호화된 것으로 확인됨 (base64 형태)")
    
    # enc 후보 추출
    enc_candidates = [31, 32, 30]
    if json_data:
        enc_from_data = json_data.get('enc') or json_data.get('encType')
        if enc_from_data:
            if isinstance(enc_from_data, (int, str)):
                enc_candidates.insert(0, int(enc_from_data))
                print(f"[복호화 테스트] json_data에서 enc 추출: {enc_from_data}")
        
        # v 필드에서 enc 추출
        v_field = json_data.get('v')
        if v_field:
            if isinstance(v_field, str):
                try:
                    v_parsed = json.loads(v_field)
                    if isinstance(v_parsed, dict) and 'enc' in v_parsed:
                        enc_from_v = v_parsed['enc']
                        if enc_from_v:
                            enc_candidates.insert(0, int(enc_from_v))
                            print(f"[복호화 테스트] v 필드에서 enc 추출: {enc_from_v}")
                except:
                    pass
    
    enc_candidates = list(dict.fromkeys(enc_candidates))  # 중복 제거
    print(f"[복호화 테스트] enc 후보: {enc_candidates}")
    
    # 복호화 시도
    if not KAKAODECRYPT_AVAILABLE:
        print(f"[경고] kakaodecrypt 모듈이 없어 복호화를 시도할 수 없습니다.")
        return room_name_raw
    
    for enc_try in enc_candidates:
        try:
            print(f"[복호화 시도] user_id={my_user_id}, enc={enc_try}")
            decrypted = KakaoDecrypt.decrypt(my_user_id, enc_try, room_name_raw)
            
            if decrypted and decrypted != room_name_raw:
                # 유효한 텍스트인지 확인
                has_control_chars = any(ord(c) < 32 and c not in '\n\r\t' for c in decrypted)
                if not has_control_chars:
                    print(f"[SUCCESS] 복호화 성공: enc={enc_try}, 복호화된 이름: \"{decrypted}\"")
                    return decrypted
                else:
                    print(f"[FAIL] 복호화 실패: 제어 문자 포함, enc={enc_try}")
            else:
                print(f"[FAIL] 복호화 실패: 결과가 None이거나 원본과 동일, enc={enc_try}")
        except Exception as e:
            print(f"[ERROR] 복호화 예외: enc={enc_try}, 오류: {e}")
    
    print(f"[FAIL] 모든 enc 시도 실패, 원본 반환: \"{room_name_raw}\"")
    return room_name_raw

def test_with_sample_data():
    """샘플 데이터로 테스트"""
    print(f"\n{'='*60}")
    print(f"[테스트] 샘플 Raw 메시지 데이터로 테스트")
    print(f"{'='*60}")
    
    # 샘플 raw 메시지 데이터 (실제 데이터로 교체 필요)
    sample_raw_message = {
        "chat_id": 18469584418690487,
        "user_id": 4897202238384074000,
        "message": "암호화된메시지",
        "v": '{"enc": 31, "origin": "MSG", "isMine": false}',
        "json": {
            "room_name": "암호화된채팅방이름",  # 실제로는 base64 형태
            "room_data": {
                "private_meta": '{"name": "암호화된채팅방이름", "enc": 31}'
            }
        }
    }
    
    my_user_id = 429744344  # 실제 my_user_id로 교체 필요
    
    result = test_room_name_from_raw_message(sample_raw_message, my_user_id)
    
    print(f"\n{'='*60}")
    print(f"[테스트 결과]")
    print(f"  - 채팅방 이름: \"{result}\"")
    print(f"  - \"의운모\" 매칭: {result == '의운모' if result else False}")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        # 파일에서 raw 메시지 읽기
        raw_message_file = sys.argv[1]
        
        # 상대 경로인 경우 현재 스크립트 디렉토리 기준으로 변환
        if not os.path.isabs(raw_message_file):
            script_dir = os.path.dirname(os.path.abspath(__file__))
            raw_message_file = os.path.join(script_dir, raw_message_file)
            # 또는 상위 디렉토리에서 찾기
            if not os.path.exists(raw_message_file):
                parent_dir = os.path.dirname(script_dir)
                alt_path = os.path.join(parent_dir, sys.argv[1])
                if os.path.exists(alt_path):
                    raw_message_file = alt_path
        
        print(f"[정보] Raw 메시지 파일 경로: {raw_message_file}")
        
        try:
            if not os.path.exists(raw_message_file):
                print(f"[오류] 파일을 찾을 수 없습니다: {raw_message_file}")
                print(f"[정보] 현재 작업 디렉토리: {os.getcwd()}")
                print(f"[정보] 스크립트 디렉토리: {os.path.dirname(os.path.abspath(__file__))}")
                sys.exit(1)
            
            with open(raw_message_file, 'r', encoding='utf-8') as f:
                raw_message_json = json.load(f)
            
            my_user_id = int(sys.argv[2]) if len(sys.argv) > 2 else None
            if not my_user_id:
                print("[오류] my_user_id를 제공해주세요.")
                print("[사용법] python3 test_room_name_raw.py <raw_message.json> <my_user_id>")
                sys.exit(1)
            
            result = test_room_name_from_raw_message(raw_message_json, my_user_id)
            
            print(f"\n{'='*60}")
            print(f"[테스트 결과]")
            print(f"  - 채팅방 이름: \"{result}\"")
            print(f"  - \"의운모\" 매칭: {result == '의운모' if result else False}")
            print(f"{'='*60}\n")
        except FileNotFoundError:
            print(f"[오류] 파일을 찾을 수 없습니다: {raw_message_file}")
        except json.JSONDecodeError as e:
            print(f"[오류] JSON 파싱 실패: {e}")
        except Exception as e:
            print(f"[오류] 테스트 실패: {e}")
            import traceback
            traceback.print_exc()
    else:
        # 샘플 데이터로 테스트
        print("[사용법] python3 test_room_name_raw.py <raw_message.json> <my_user_id>")
        print("[예시] python3 test_room_name_raw.py sample_message.json 429744344")
        print("\n샘플 데이터로 테스트를 진행합니다...")
        test_with_sample_data()

