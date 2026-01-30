// ============================================
// 채팅방 관리 모듈
// ============================================

const db = require('../database');

/**
 * 채팅방 조회 또는 생성
 */
async function getOrCreateRoom(roomName, roomType = 'group') {
  try {
    const { data: existingRoom } = await db.supabase
      .from('rooms')
      .select('*')
      .eq('name', roomName)
      .single();
    
    if (existingRoom) {
      return existingRoom;
    }
    
    const { data: newRoom, error } = await db.supabase
      .from('rooms')
      .insert({
        name: roomName,
        type: roomType,
        created_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('[채팅방 생성 오류]', error);
      return null;
    }
    
    return newRoom;
  } catch (error) {
    console.error('[채팅방 조회/생성 오류]', error);
    return null;
  }
}

/**
 * 채팅방 멤버십 확인 및 생성
 */
async function ensureRoomMembership(roomId, userId, role = 'member') {
  try {
    const { data: existingMembership } = await db.supabase
      .from('room_members')
      .select('*')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .single();
    
    if (existingMembership) {
      if (existingMembership.role !== role) {
        await db.supabase
          .from('room_members')
          .update({ role })
          .eq('id', existingMembership.id);
      }
      return existingMembership;
    }
    
    const { data: newMembership, error } = await db.supabase
      .from('room_members')
      .insert({
        room_id: roomId,
        user_id: userId,
        role,
        joined_at: new Date().toISOString()
      })
      .select()
      .single();
    
    if (error) {
      console.error('[멤버십 생성 오류]', error);
      return null;
    }
    
    return newMembership;
  } catch (error) {
    console.error('[멤버십 확인/생성 오류]', error);
    return null;
  }
}

module.exports = {
  getOrCreateRoom,
  ensureRoomMembership
};







