"""
irispy 클라이언트 with GitHub 동기화 기능
로컬에서 GitHub에 업로드한 파일을 핸드폰에서 자동으로 동기화
"""

from iris.bot import Bot
from iris.bot.models import ChatContext
import subprocess
import os
import hashlib
import json
from pathlib import Path

# 설정
GITHUB_REPO = "OreoMini1990/iris-client"  # GitHub 저장소 (예: "username/repo")
GITHUB_BRANCH = "main"  # 브랜치 이름
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")  # GitHub Personal Access Token (선택적)
SYNC_FILE = "irispy.py"  # 동기화할 파일명
ADMIN_USERS = ["관리자카카오톡ID"]  # 관리자 카카오톡 ID 목록

# 마지막 동기화 해시 저장 파일
SYNC_HASH_FILE = ".sync_hash.json"

def get_file_hash(content: str) -> str:
    """파일 내용의 해시값 계산"""
    return hashlib.sha256(content.encode()).hexdigest()

def load_sync_hash() -> dict:
    """마지막 동기화 해시 로드"""
    if os.path.exists(SYNC_HASH_FILE):
        try:
            with open(SYNC_HASH_FILE, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_sync_hash(hash_dict: dict):
    """마지막 동기화 해시 저장"""
    with open(SYNC_HASH_FILE, 'w') as f:
        json.dump(hash_dict, f)

def download_file_from_github(repo: str, branch: str, filepath: str, token: str = "") -> str:
    """GitHub에서 파일 다운로드"""
    import requests
    
    url = f"https://api.github.com/repos/{repo}/contents/{filepath}"
    headers = {}
    if token:
        headers["Authorization"] = f"token {token}"
    
    params = {"ref": branch}
    
    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
        
        import base64
        content = base64.b64decode(data["content"]).decode("utf-8")
        return content
    except Exception as e:
        raise Exception(f"GitHub에서 파일 다운로드 실패: {e}")

def sync_from_github(chat: ChatContext) -> tuple[bool, str]:
    """GitHub에서 파일 동기화"""
    try:
        # GitHub에서 파일 다운로드
        chat.reply("[Github 코드 확인중!]")
        remote_content = download_file_from_github(
            GITHUB_REPO, 
            GITHUB_BRANCH, 
            SYNC_FILE,
            GITHUB_TOKEN
        )
        
        chat.reply("[Github 코드 확인 완료!]")
        
        # 현재 파일 해시 확인
        sync_hash = load_sync_hash()
        remote_hash = get_file_hash(remote_content)
        
        # 이미 동기화되어 있는지 확인
        if sync_hash.get(SYNC_FILE) == remote_hash:
            return False, "[Github 코드와 이미 동기화 되어있어!]"
        
        # 로컬 파일과 비교
        local_hash = None
        if os.path.exists(SYNC_FILE):
            with open(SYNC_FILE, 'r', encoding='utf-8') as f:
                local_content = f.read()
                local_hash = get_file_hash(local_content)
        
        # 변경사항이 있으면 업데이트
        if local_hash != remote_hash:
            chat.reply("[Github 코드와 동기화 시작!]")
            
            # 백업 생성
            if os.path.exists(SYNC_FILE):
                backup_file = f"{SYNC_FILE}.backup"
                with open(SYNC_FILE, 'r', encoding='utf-8') as f:
                    with open(backup_file, 'w', encoding='utf-8') as bf:
                        bf.write(f.read())
            
            # 파일 업데이트
            with open(SYNC_FILE, 'w', encoding='utf-8') as f:
                f.write(remote_content)
            
            # 해시 저장
            sync_hash[SYNC_FILE] = remote_hash
            save_sync_hash(sync_hash)
            
            chat.reply("[Github 최신데이터로 동기화 하는중!]")
            chat.reply("[Github 최신데이터로 동기화 완료!]")
            
            # 커밋 메시지 가져오기 (선택적)
            try:
                import requests
                url = f"https://api.github.com/repos/{GITHUB_REPO}/commits"
                headers = {}
                if GITHUB_TOKEN:
                    headers["Authorization"] = f"token {GITHUB_TOKEN}"
                params = {"path": SYNC_FILE, "per_page": 1}
                response = requests.get(url, headers=headers, params=params)
                if response.status_code == 200:
                    commits = response.json()
                    if commits:
                        commit = commits[0]
                        commit_msg = commit["commit"]["message"]
                        commit_author = commit["commit"]["author"]["name"]
                        chat.reply(f"[What's New?]\n{SYNC_FILE} 업데이트\n{commit_msg}\n- {commit_author}")
            except:
                pass
            
            return True, "동기화 완료"
        else:
            return False, "[Github 코드와 이미 동기화 되어있어!]"
            
    except Exception as e:
        return False, f"동기화 실패: {str(e)}"

def is_admin(sender_id: str) -> bool:
    """관리자 여부 확인"""
    return sender_id in ADMIN_USERS

# Bot 초기화
bot = Bot("211.218.42.222:5002")

@bot.on_event("chat")
def on_chat_debug(chat: ChatContext):
    print(f"[DEBUG] chat 이벤트 수신!")
    print(f"메시지: {chat.message.msg}")
    print(f"방: {chat.room.name}")
    print(f"발신자: {chat.sender.name}")

@bot.on_event("message")
def on_message(chat: ChatContext):
    message = chat.message.msg
    sender_id = chat.sender.name  # 또는 chat.sender.id
    
    # 동기화 명령어 처리
    if message == "/동기화" or message == "/sync":
        # 관리자 확인
        if not is_admin(sender_id):
            chat.reply("[최고관리자 전용 기능이야!]")
            return
        
        # 동기화 실행
        success, msg = sync_from_github(chat)
        if not success and "이미 동기화" in msg:
            chat.reply(msg)
        elif success:
            chat.reply("동기화 완료! 재시작이 필요할 수 있습니다.")
        else:
            chat.reply(msg)
        return
    
    # 기존 메시지 처리
    match chat.message.command:
        case "!hi":
            chat.reply(f"Hello, {chat.sender.name}!")

if __name__ == "__main__":
    print("[INFO] 클라이언트 시작...")
    print(f"[INFO] GitHub 동기화 기능 활성화")
    print(f"[INFO] 저장소: {GITHUB_REPO}")
    print(f"[INFO] 관리자: {', '.join(ADMIN_USERS)}")
    bot.run()

