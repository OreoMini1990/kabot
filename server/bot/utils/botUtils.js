// ============================================
// 봇 유틸리티 함수 모듈
// ============================================

const fs = require('fs');
const CONFIG = require('../config');

// 복호화 모듈 (순환 참조 방지를 위해 lazy require)
let decryptKakaoTalkMessage = null;
function getDecryptFunction() {
  if (!decryptKakaoTalkMessage) {
    try {
      const { decryptKakaoTalkMessage: decryptFn } = require('../../crypto/kakaoDecrypt');
      decryptKakaoTalkMessage = decryptFn;
    } catch (err) {
      console.error('[extractSenderName] 복호화 모듈 로드 실패:', err.message);
    }
  }
  return decryptKakaoTalkMessage;
}

/**
 * 발신자 이름 추출 (복호화 포함)
 */
function extractSenderName(json, sender) {
  // 1순위: 이미 복호화된 이름 사용
  if (json && json.sender_name_decrypted) {
    return json.sender_name_decrypted;
  }
  
  // 2순위: json.sender_name_encrypted 확인 (클라이언트에서 복호화 실패한 경우)
  if (json && json.sender_name_encrypted) {
    const encryptedName = json.sender_name_encrypted;
    const isBase64Like = encryptedName.length >= 16 && 
                         encryptedName.length % 4 === 0 &&
                         /^[A-Za-z0-9+/=]+$/.test(encryptedName);
    
    if (isBase64Like && json.myUserId) {
      const decryptFn = getDecryptFunction();
      if (decryptFn) {
        // enc 후보: 31, 30, 32 순으로 시도
        for (const encTry of [31, 30, 32]) {
          try {
            const decrypted = decryptFn(encryptedName, String(json.myUserId), encTry);
            if (decrypted && decrypted !== encryptedName) {
              const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decrypted);
              const isBase64Pattern = /^[A-Za-z0-9+/=]+$/.test(decrypted) && decrypted.length > 20;
              const isValidText = !hasControlChars && !isBase64Pattern;
              
              if (isValidText) {
                return decrypted;
              }
            }
          } catch (e) {
            // 복호화 실패, 다음 enc 시도
          }
        }
      }
    }
  }
  
  // 3순위: json.sender_name 확인 (복호화 필요할 수 있음)
  if (json && json.sender_name) {
    const senderName = json.sender_name;
    const isBase64Like = senderName.length >= 16 && 
                         senderName.length % 4 === 0 &&
                         /^[A-Za-z0-9+/=]+$/.test(senderName);
    
    if (!isBase64Like) {
      return senderName;
    }
    
    // 암호화된 것으로 보이면 복호화 시도
    if (isBase64Like && json.myUserId) {
      const decryptFn = getDecryptFunction();
      if (decryptFn) {
        // enc 후보: 31, 30, 32 순으로 시도
        for (const encTry of [31, 30, 32]) {
          try {
            const decrypted = decryptFn(senderName, String(json.myUserId), encTry);
            if (decrypted && decrypted !== senderName) {
              const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decrypted);
              const isBase64Pattern = /^[A-Za-z0-9+/=]+$/.test(decrypted) && decrypted.length > 20;
              const isValidText = !hasControlChars && !isBase64Pattern;
              
              if (isValidText) {
                return decrypted;
              }
            }
          } catch (e) {
            // 복호화 실패, 다음 enc 시도
          }
        }
      }
    }
  }
  
  // 4순위: sender 필드에서 추출 (하위 호환성)
  if (sender && sender.includes('/')) {
    const parts = sender.split('/');
    // 마지막 부분이 숫자(user_id)인지 확인
    const lastPart = parts[parts.length - 1];
    const isUserId = /^\d+$/.test(lastPart.trim());
    
    if (isUserId) {
      // 마지막 부분이 user_id면 나머지 전체를 닉네임으로 사용
      const namePart = parts.slice(0, -1).join('/').trim();
      
      // 이미 복호화된 이름인지 확인
      // base64 패턴 체크: 길이가 16 이상이고 4의 배수이며 base64 문자만 포함
      const isBase64Like = namePart.length >= 16 && 
                           namePart.length % 4 === 0 &&
                           /^[A-Za-z0-9+/=]+$/.test(namePart);
      
      if (!isBase64Like) {
        // 이미 복호화된 이름 (base64 패턴이 아님)
        return namePart;
      }
      
      // 암호화된 것으로 보이면 복호화 시도 (길이가 16 이상인 경우만)
      if (isBase64Like && namePart.length >= 16 && json && json.myUserId) {
        const decryptFn = getDecryptFunction();
        if (decryptFn) {
          // enc 후보: 31, 30, 32 순으로 시도
          for (const encTry of [31, 30, 32]) {
            try {
              const decrypted = decryptFn(namePart, String(json.myUserId), encTry);
              if (decrypted && decrypted !== namePart) {
                const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decrypted);
                const isBase64Pattern = /^[A-Za-z0-9+/=]+$/.test(decrypted) && decrypted.length > 20;
                const isValidText = !hasControlChars && !isBase64Pattern;
                
                if (isValidText) {
                  return decrypted;
                }
              }
            } catch (e) {
              // 복호화 실패, 다음 enc 시도
            }
          }
        }
      }
    } else {
      // 마지막 부분이 user_id가 아니면 첫 부분만 사용 (하위 호환성)
      const namePart = parts[0].trim();
      const isBase64Like = namePart.length >= 16 && 
                           namePart.length % 4 === 0 &&
                           /^[A-Za-z0-9+/=]+$/.test(namePart);
      
      if (!isBase64Like) {
        return namePart;
      }
      
      // 암호화된 것으로 보이면 복호화 시도 (길이가 16 이상인 경우만)
      if (isBase64Like && namePart.length >= 16 && json && json.myUserId) {
        const decryptFn = getDecryptFunction();
        if (decryptFn) {
          for (const encTry of [31, 30, 32]) {
            try {
              const decrypted = decryptFn(namePart, String(json.myUserId), encTry);
              if (decrypted && decrypted !== namePart) {
                const hasControlChars = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(decrypted);
                const isBase64Pattern = /^[A-Za-z0-9+/=]+$/.test(decrypted) && decrypted.length > 20;
                const isValidText = !hasControlChars && !isBase64Pattern;
                
                if (isValidText) {
                  return decrypted;
                }
              }
            } catch (e) {
              // 복호화 실패, 다음 enc 시도
            }
          }
        }
      }
    }
  }
  
  return sender || '';
}

/**
 * 발신자 ID 추출
 */
function extractSenderId(json, sender) {
  if (json && json.user_id) {
    return String(json.user_id);
  }
  
  if (json && json.userId) {
    return String(json.userId);
  }
  
  if (sender && sender.includes('/')) {
    const parts = sender.split('/');
    const idPart = parts[parts.length - 1];
    if (/^\d+$/.test(idPart)) {
      return idPart;
    }
  }
  
  return null;
}

/**
 * 관리자 여부 확인 (chat_id로만 확인, 닉네임 무관)
 */
function isAdmin(sender, json = null) {
  const senderId = extractSenderId(json, sender);
  
  // ⚠️ 중요: chat_id로만 확인, 닉네임은 무시
  // ADMIN_USER_IDS에 있는 chat_id와 일치하는지 확인
  if (senderId) {
    const isAdminById = CONFIG.ADMIN_USER_IDS.some(adminId => {
      const adminIdStr = String(adminId).trim();
      const senderIdStr = String(senderId).trim();
      return adminIdStr === senderIdStr;
    });
    
    if (isAdminById) {
      console.log(`[관리자 확인] ✅ chat_id로 관리자 확인: ${senderId}`);
      return true;
    }
  }
  
  // 하위 호환성: ADMIN_USERS도 확인 (닉네임 기반)
  const senderName = extractSenderName(json, sender);
  const isAdminByName = CONFIG.ADMIN_USERS.some(admin => {
    if (admin.includes('/')) {
      // 전체 이름 일치 (예: "랩장/AN/서울")
      if (senderName && senderName.trim() === admin.trim()) return true;
      const [adminName, adminId] = admin.split('/');
      return (senderName && adminName === senderName) ||
             (senderId && adminId && String(senderId).trim() === String(adminId).trim());
    }
    return senderName && senderName.trim() === admin.trim();
  });
  
  if (isAdminByName) {
    console.log(`[관리자 확인] ⚠️ 닉네임 기반 관리자 확인 (권장하지 않음): ${senderName || senderId}`);
  }
  
  return isAdminByName;
}

/**
 * 안전한 파일 읽기
 */
function readFileSafe(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
    return null;
  } catch (error) {
    console.error(`[파일 읽기 오류] ${filePath}:`, error.message);
    return null;
  }
}

/**
 * 안전한 파일 쓰기
 */
function writeFileSafe(filePath, content) {
  try {
    const dir = require('path').dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (error) {
    console.error(`[파일 쓰기 오류] ${filePath}:`, error.message);
    return false;
  }
}

/**
 * 통화 포맷
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('ko-KR').format(amount);
}

/**
 * 날짜 포맷
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('ko-KR');
}

/**
 * 포맷된 현재 날짜
 */
function getFormattedDate() {
  return new Date().toLocaleDateString('ko-KR');
}

module.exports = {
  extractSenderName,
  extractSenderId,
  isAdmin,
  readFileSafe,
  writeFileSafe,
  formatCurrency,
  formatDate,
  getFormattedDate
};


