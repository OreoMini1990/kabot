// ============================================
// 사용자 관리 모듈
// ============================================

const db = require('../database');
const crypto = require('crypto');

/**
 * 사용자 조회 또는 생성
 */
async function getOrCreateUser(roomName, senderName, senderId) {
  try {
    const internalUserId = crypto
      .createHash('md5')
      .update(`${roomName}|${senderName}|${senderId || ''}`)
      .digest('hex');
    
    let existingUser = null;
    
    if (senderId) {
      const { data: userByKakaoId } = await db.supabase
        .from('users')
        .select('*')
        .eq('kakao_user_id', senderId)
        .single();
      
      if (userByKakaoId) {
        existingUser = userByKakaoId;
      }
    }
    
    if (!existingUser) {
      const { data: userByInternalId } = await db.supabase
        .from('users')
        .select('*')
        .eq('internal_user_id', internalUserId)
        .single();
      
      if (userByInternalId) {
        existingUser = userByInternalId;
        
        if (senderId && !existingUser.kakao_user_id) {
          await db.supabase
            .from('users')
            .update({ kakao_user_id: senderId })
            .eq('id', existingUser.id);
          existingUser.kakao_user_id = senderId;
        }
      }
    }
    
    if (existingUser) {
      if (existingUser.display_name !== senderName) {
        await db.supabase
          .from('user_name_history')
          .insert({
            user_id: existingUser.id,
            old_name: existingUser.display_name,
            new_name: senderName,
            changed_at: new Date().toISOString()
          });
        
        await db.supabase
          .from('users')
          .update({ display_name: senderName })
          .eq('id', existingUser.id);
        
        existingUser.display_name = senderName;
      }
      
      return existingUser;
    }
    
    const { data: newUser, error } = await db.supabase
      .from('users')
      .insert({
        internal_user_id: internalUserId,
        kakao_user_id: senderId || null,
        display_name: senderName,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('[사용자 생성 오류]', error);
      return null;
    }
    
    return newUser;
  } catch (error) {
    console.error('[사용자 조회/생성 오류]', error);
    return null;
  }
}

module.exports = {
  getOrCreateUser
};







