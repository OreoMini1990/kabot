// 실제 핸드폰에서 넘어온 메시지로 테스트
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// server.js의 복호화 함수들을 복사
const KAKAO_IV = Buffer.from([15, 8, 1, 0, 25, 71, 37, 220, 21, 245, 23, 224, 225, 21, 12, 53]);
const KAKAO_PASSWORD = Buffer.from([22, 8, 9, 111, 2, 23, 43, 8, 33, 33, 10, 16, 3, 3, 7, 6]);

function incept(n) {
  const dict1 = ['adrp.ldrsh.ldnp', 'ldpsw', 'umax', 'stnp.rsubhn', 'sqdmlsl', 'uqrshl.csel', 'sqshlu', 'umin.usubl.umlsl', 'cbnz.adds', 'tbnz',
    'usubl2', 'stxr', 'sbfx', 'strh', 'stxrb.adcs', 'stxrh', 'ands.urhadd', 'subs', 'sbcs', 'fnmadd.ldxrb.saddl',
    'stur', 'ldrsb', 'strb', 'prfm', 'ubfiz', 'ldrsw.madd.msub.sturb.ldursb', 'ldrb', 'b.eq', 'ldur.sbfiz', 'extr',
    'fmadd', 'uqadd', 'sshr.uzp1.sttrb', 'umlsl2', 'rsubhn2.ldrh.uqsub', 'uqshl', 'uabd', 'ursra', 'usubw', 'uaddl2',
    'b.gt', 'b.lt', 'sqshl', 'bics', 'smin.ubfx', 'smlsl2', 'uabdl2', 'zip2.ssubw2', 'ccmp', 'sqdmlal',
    'b.al', 'smax.ldurh.uhsub', 'fcvtxn2', 'b.pl'];
  const dict2 = ['saddl', 'urhadd', 'ubfiz.sqdmlsl.tbnz.stnp', 'smin', 'strh', 'ccmp', 'usubl', 'umlsl', 'uzp1', 'sbfx',
    'b.eq', 'zip2.prfm.strb', 'msub', 'b.pl', 'csel', 'stxrh.ldxrb', 'uqrshl.ldrh', 'cbnz', 'ursra', 'sshr.ubfx.ldur.ldnp',
    'fcvtxn2', 'usubl2', 'uaddl2', 'b.al', 'ssubw2', 'umax', 'b.lt', 'adrp.sturb', 'extr', 'uqshl',
    'smax', 'uqsub.sqshlu', 'ands', 'madd', 'umin', 'b.gt', 'uabdl2', 'ldrsb.ldpsw.rsubhn', 'uqadd', 'sttrb',
    'stxr', 'adds', 'rsubhn2.umlsl2', 'sbcs.fmadd', 'usubw', 'sqshl', 'stur.ldrsh.smlsl2', 'ldrsw', 'fnmadd', 'stxrb.sbfiz',
    'adcs', 'bics.ldrb', 'l1ursb', 'subs.uhsub', 'ldurh', 'uabd', 'sqdmlal'];
  const word1 = dict1[n % dict1.length];
  const word2 = dict2[(n + 31) % dict2.length];
  return word1 + '.' + word2;
}

const KAKAO_PREFIXES = [
  '', '', '12', '24', '18', '30', '36', '12', '48', '7', '35', '40',
  '17', '23', '29', 'isabel', 'kale', 'sulli', 'van', 'merry', 'kyle',
  'james', 'maddux', 'tony', 'hayden', 'paul', 'elijah', 'dorothy',
  'sally', 'bran', incept(830819), 'veil'
];

function generateSalt(userId, encType) {
  const userIdStr = String(userId);
  const encTypeNum = Number(encType);
  const prefix = KAKAO_PREFIXES[encTypeNum] || '';
  let saltStr = (prefix + userIdStr).substring(0, 16);
  const salt = Buffer.alloc(16, 0);
  const saltBytes = Buffer.from(saltStr, 'utf-8');
  const copyLen = Math.min(saltBytes.length, 16);
  saltBytes.copy(salt, 0, 0, copyLen);
  return salt;
}

function pkcs16adjust(aArray, aOff, b) {
  let x = (b[b.length - 1] & 0xff) + (aArray[aOff + b.length - 1] & 0xff) + 1;
  aArray[aOff + b.length - 1] = x % 256;
  x = x >> 8;
  for (let i = b.length - 2; i >= 0; i--) {
    x = x + (b[i] & 0xff) + (aArray[aOff + i] & 0xff);
    aArray[aOff + i] = x % 256;
    x = x >> 8;
  }
}

function generateSecretKey(salt) {
  const password = Buffer.from(KAKAO_PASSWORD);
  const passwordWithNull = Buffer.concat([password, Buffer.from([0])]);
  const passwordUtf16be = Buffer.alloc(passwordWithNull.length * 2);
  for (let i = 0; i < passwordWithNull.length; i++) {
    const byte = passwordWithNull[i];
    passwordUtf16be[i * 2] = 0;
    passwordUtf16be[i * 2 + 1] = byte;
  }
  
  const v = 64;
  const u = 20;
  const D = Buffer.alloc(v, 1);
  // Python 코드와 정확히 동일: math.ceil(len(salt) / v)
  const saltLen = Math.ceil(salt.length / v);
  const S = Buffer.alloc(v * saltLen);
  for (let i = 0; i < S.length; i++) {
    S[i] = salt[i % salt.length];
  }
  
  // Python 코드와 정확히 동일: math.ceil(len(password) / v)
  const passLen = Math.ceil(passwordUtf16be.length / v);
  const P = Buffer.alloc(v * passLen);
  for (let i = 0; i < P.length; i++) {
    P[i] = passwordUtf16be[i % passwordUtf16be.length];
  }
  
  const I = Buffer.concat([S, P]);
  const B = Buffer.alloc(v);
  const dkeySize = 32;
  const c = Math.ceil((dkeySize + u - 1) / u);
  const dKey = Buffer.alloc(dkeySize);
  
  for (let i = 1; i <= c; i++) {
    const hash1 = crypto.createHash('sha1');
    hash1.update(D);
    hash1.update(I);
    let A = Buffer.from(hash1.digest());
    
    for (let j = 1; j < 2; j++) {
      const hash2 = crypto.createHash('sha1');
      hash2.update(A);
      A = Buffer.from(hash2.digest());
    }
    
    for (let j = 0; j < B.length; j++) {
      B[j] = A[j % A.length];
    }
    
    for (let j = 0; j < Math.floor(I.length / v); j++) {
      pkcs16adjust(I, j * v, B);
    }
    
    const start = (i - 1) * u;
    const remaining = dkeySize - start;
    if (remaining > 0) {
      const writeLen = Math.min(remaining, A.length);
      A.copy(dKey, start, 0, writeLen);
    }
  }
  
  return dKey;
}

function decryptKakaoTalkMessage(encryptedText, userId, encType = 31) {
  try {
    if (!encryptedText || encryptedText === '{}' || encryptedText === '[]') {
      return encryptedText;
    }
    
    const userIdStr = String(userId);
    const encTypeNum = Number(encType);
    
    const salt = generateSalt(userIdStr, encTypeNum);
    console.log(`[테스트] Salt 생성: userId=${userId}, encType=${encType}, salt hex=${salt.toString('hex')}`);
    
    const secretKey = generateSecretKey(salt);
    console.log(`[테스트] SecretKey 생성: key hex=${secretKey.toString('hex')}`);
    
    let decoded;
    try {
      decoded = Buffer.from(encryptedText, 'base64');
    } catch (e) {
      console.log(`[테스트] Base64 디코딩 실패: ${e.message}`);
      return null;
    }
    
    console.log(`[테스트] Base64 디코딩: 암호문 길이=${decoded.length}`);
    
    if (decoded.length === 0 || decoded.length % 16 !== 0) {
      console.log(`[테스트] 실패: 암호문 길이가 0이거나 16의 배수가 아님: ${decoded.length}`);
      return null;
    }
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', secretKey, KAKAO_IV);
    decipher.setAutoPadding(false);
    
    let padded;
    try {
      padded = Buffer.concat([decipher.update(decoded), decipher.final()]);
      console.log(`[테스트] AES 복호화 완료: padded 길이=${padded.length}`);
    } catch (e) {
      console.log(`[테스트] BadPaddingException 또는 복호화 오류: ${e.message}`);
      return encryptedText;
    }
    
    if (padded.length === 0) {
      console.log(`[테스트] 경고: 복호화된 데이터가 비어있음`);
      return null;
    }
    
    const lastByte = padded[padded.length - 1];
    const paddingLength = lastByte & 0xff;
    console.log(`[테스트] 패딩 확인: padded 길이=${padded.length}, 마지막 바이트=${lastByte}, paddingLength=${paddingLength}`);
    
    if (paddingLength <= 0 || paddingLength > 16) {
      console.log(`[테스트] 실패: 잘못된 패딩 길이 (${paddingLength})`);
      return null;
    }
    
    if (paddingLength > padded.length) {
      console.log(`[테스트] 실패: 패딩 길이(${paddingLength})가 데이터 길이(${padded.length})보다 큼`);
      return null;
    }
    
    const plaintext = padded.slice(0, padded.length - paddingLength);
    console.log(`[테스트] PKCS5 패딩 제거: paddingLength=${paddingLength}, plaintext 길이=${plaintext.length}`);
    
    if (plaintext.length === 0) {
      console.log(`[테스트] 실패: 패딩 제거 후 길이가 0`);
      return null;
    }
    
    try {
      const decodedText = plaintext.toString('utf-8');
      console.log(`[테스트] ✓ 복호화 성공: "${decodedText}"`);
      return decodedText;
    } catch (e) {
      console.log(`[테스트] UTF-8 디코딩 실패: ${e.message}`);
      return null;
    }
  } catch (e) {
    console.error(`[테스트] 복호화 오류:`, e);
    return null;
  }
}

// 실제 메시지 테스트
console.log('='.repeat(80));
console.log('실제 핸드폰 메시지 복호화 테스트');
console.log('='.repeat(80));

const testCases = [
  // 테스트 스크립트의 샘플 메시지 (성공해야 함)
  {
    message: 'q2R8bEZX8gA7xQ2r9/8vQw==',
    userId: '12345678',
    enc: 31,
    description: '테스트 샘플 1: userId=12345678, enc=31'
  },
  {
    message: 'VGVzdE1zZyE=',
    userId: '12345678',
    enc: 31,
    description: '테스트 샘플 2: userId=12345678, enc=31'
  },
  // 실제 핸드폰 메시지
  {
    message: 'MHo47Z5QfwCRysWpnhociQ==',
    userId: '363060131',  // 문자열로 처리 (큰 정수 정밀도 손실 방지)
    enc: 31,
    description: '실제 메시지 1: userId=363060131, enc=31'
  },
  {
    message: 'MHo47Z5QfwCRysWpnhociQ==',
    userId: '429744344',  // 문자열로 처리
    enc: 31,
    description: '실제 메시지 1 (myUserId 시도): userId=429744344, enc=31'
  },
  {
    message: '3GZ8JLb4YIclqZOiWrrp5Q==',
    userId: '4897202238384073231',  // 문자열로 처리 (큰 정수 정밀도 손실 방지)
    enc: 31,
    description: '실제 메시지 2: userId=4897202238384073231, enc=31'
  },
  {
    message: '3GZ8JLb4YIclqZOiWrrp5Q==',
    userId: '429744344',  // 문자열로 처리
    enc: 31,
    description: '실제 메시지 2 (myUserId 시도): userId=429744344, enc=31'
  }
];

for (const testCase of testCases) {
  console.log('\n' + '-'.repeat(80));
  console.log(`테스트: ${testCase.description}`);
  console.log(`암호문: ${testCase.message}`);
  const result = decryptKakaoTalkMessage(testCase.message, testCase.userId, testCase.enc);
  if (result) {
    console.log(`✓ 성공: "${result}"`);
  } else {
    console.log(`✗ 실패`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('테스트 완료');
console.log('='.repeat(80));

