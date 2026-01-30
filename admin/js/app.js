// ============================================
// 관리자 패널 메인 JavaScript
// ============================================

const API_BASE = '/api/admin';
let authToken = localStorage.getItem('adminToken') || '';

// 로그 관련 변수
let logsAutoRefreshInterval = null;
let currentLogType = 'combined'; // 'server', 'client', 'combined'

// 페이지 로드 시
document.addEventListener('DOMContentLoaded', () => {
    // 로그 버튼은 네비게이션 탭 영역에 항상 표시되므로 숨기지 않음
    
    if (authToken) {
        document.getElementById('adminToken').value = authToken;
        // 약간의 지연 후 setToken 호출 (DOM이 완전히 로드된 후)
        setTimeout(() => {
            setToken();
        }, 100);
    }
    
    loadProfanity();
    loadNotices();
    loadFilterLogs();
    loadWarnings();
});

// 토큰 설정
function setToken() {
    const token = document.getElementById('adminToken').value;
    if (!token) {
        showAuthStatus('토큰을 입력하세요', 'error');
        // 로그 버튼 숨기기
        const logsBtn = document.getElementById('logs-btn');
        if (logsBtn) {
            logsBtn.classList.add('hidden');
        }
        return;
    }
    
    // 인증 테스트 (API 호출)
    fetch(`${API_BASE}/profanity?limit=1`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    }).then(response => {
        if (response.ok) {
            authToken = token;
            localStorage.setItem('adminToken', token);
            showAuthStatus('인증 완료', 'success');
            
            // 데이터 다시 로드
            loadProfanity();
            loadNotices();
            loadFilterLogs();
            loadWarnings();
        } else {
            showAuthStatus('인증 실패', 'error');
        }
    }).catch(error => {
        console.error('[인증 오류]', error);
        showAuthStatus('인증 오류', 'error');
    });
}

function showAuthStatus(message, type) {
    const status = document.getElementById('authStatus');
    status.textContent = message;
    status.className = `status ${type}`;
    setTimeout(() => {
        status.textContent = '';
        status.className = 'status';
    }, 3000);
}

// 탭 전환
function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(`${tabName}-tab`).classList.add('active');
    event.target.classList.add('active');
}

// ============================================
// 비속어 필터 관리
// ============================================

let currentProfanityFilter = 'all';

function filterProfanity(type) {
    currentProfanityFilter = type;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    loadProfanity();
}

async function loadProfanity() {
    try {
        const url = currentProfanityFilter === 'all' 
            ? `${API_BASE}/profanity`
            : `${API_BASE}/profanity?type=${currentProfanityFilter}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('조회 실패');
        }
        
        const data = await response.json();
        renderProfanityTable(data.data);
    } catch (error) {
        document.getElementById('profanity-tbody').innerHTML = 
            `<tr><td colspan="5" class="loading">오류: ${error.message}</td></tr>`;
    }
}

function renderProfanityTable(words) {
    const tbody = document.getElementById('profanity-tbody');
    
    if (words.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">데이터가 없습니다</td></tr>';
        return;
    }
    
    tbody.innerHTML = words.map(word => `
        <tr>
            <td>${word.id}</td>
            <td>${escapeHtml(word.word)}</td>
            <td><span class="badge ${word.type}">${word.type === 'profanity' ? '비속어' : '타직업 비하'}</span></td>
            <td>${formatDate(word.created_at)}</td>
            <td>
                <button class="btn-edit" onclick="editProfanity(${word.id}, '${escapeHtml(word.word)}', '${word.type}')">수정</button>
                <button class="btn-danger" onclick="deleteProfanity(${word.id})">삭제</button>
            </td>
        </tr>
    `).join('');
}

function showAddProfanityModal() {
    document.getElementById('profanity-modal-title').textContent = '비속어 추가';
    document.getElementById('profanity-form').reset();
    document.getElementById('profanity-id').value = '';
    document.getElementById('profanity-modal').style.display = 'block';
}

function editProfanity(id, word, type) {
    document.getElementById('profanity-modal-title').textContent = '비속어 수정';
    document.getElementById('profanity-id').value = id;
    document.getElementById('profanity-word').value = word;
    document.getElementById('profanity-type').value = type;
    document.getElementById('profanity-modal').style.display = 'block';
}

async function saveProfanity(event) {
    event.preventDefault();
    
    const id = document.getElementById('profanity-id').value;
    const word = document.getElementById('profanity-word').value;
    const type = document.getElementById('profanity-type').value;
    
    try {
        const url = id ? `${API_BASE}/profanity/${id}` : `${API_BASE}/profanity`;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ word, type })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '저장 실패');
        }
        
        closeModal('profanity-modal');
        loadProfanity();
        alert('저장되었습니다');
    } catch (error) {
        alert(`오류: ${error.message}`);
    }
}

async function deleteProfanity(id) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/profanity/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('삭제 실패');
        }
        
        loadProfanity();
        alert('삭제되었습니다');
    } catch (error) {
        alert(`오류: ${error.message}`);
    }
}

// ============================================
// 공지 관리
// ============================================

async function loadNotices() {
    try {
        const response = await fetch(`${API_BASE}/notices`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('조회 실패');
        }
        
        const data = await response.json();
        renderNoticesTable(data.data);
    } catch (error) {
        document.getElementById('notices-tbody').innerHTML = 
            `<tr><td colspan="6" class="loading">오류: ${error.message}</td></tr>`;
    }
}

function renderNoticesTable(notices) {
    const tbody = document.getElementById('notices-tbody');
    
    if (notices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">데이터가 없습니다</td></tr>';
        return;
    }
    
    tbody.innerHTML = notices.map(notice => `
        <tr>
            <td>${notice.id}</td>
            <td>${escapeHtml(notice.content.substring(0, 50))}${notice.content.length > 50 ? '...' : ''}</td>
            <td>${notice.expiry_date || '-'}</td>
            <td>${notice.schedule_times ? notice.schedule_times.join(', ') : '-'}</td>
            <td><span class="badge ${notice.enabled ? 'enabled' : 'disabled'}">${notice.enabled ? '활성' : '비활성'}</span></td>
            <td>
                <button class="btn-edit" onclick="editNotice(${notice.id})">수정</button>
                <button class="btn-danger" onclick="deleteNotice(${notice.id})">삭제</button>
            </td>
        </tr>
    `).join('');
}

function showAddNoticeModal() {
    document.getElementById('notice-modal-title').textContent = '공지 추가';
    document.getElementById('notice-form').reset();
    document.getElementById('notice-id').value = '';
    document.getElementById('notice-enabled').checked = true;
    document.getElementById('notice-modal').style.display = 'block';
}

async function editNotice(id) {
    try {
        const response = await fetch(`${API_BASE}/notices`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) throw new Error('조회 실패');
        
        const data = await response.json();
        const notice = data.data.find(n => n.id === id);
        
        if (!notice) throw new Error('공지를 찾을 수 없습니다');
        
        document.getElementById('notice-modal-title').textContent = '공지 수정';
        document.getElementById('notice-id').value = notice.id;
        document.getElementById('notice-content').value = notice.content;
        document.getElementById('notice-expiry').value = notice.expiry_date || '';
        document.getElementById('notice-schedule').value = notice.schedule_times ? notice.schedule_times.join(',') : '';
        document.getElementById('notice-enabled').checked = notice.enabled;
        document.getElementById('notice-modal').style.display = 'block';
    } catch (error) {
        alert(`오류: ${error.message}`);
    }
}

async function saveNotice(event) {
    event.preventDefault();
    
    const id = document.getElementById('notice-id').value;
    const content = document.getElementById('notice-content').value;
    const expiry = document.getElementById('notice-expiry').value;
    const schedule = document.getElementById('notice-schedule').value;
    const enabled = document.getElementById('notice-enabled').checked;
    
    const scheduleTimes = schedule ? schedule.split(',').map(s => s.trim()).filter(s => s) : null;
    
    try {
        const url = id ? `${API_BASE}/notices/${id}` : `${API_BASE}/notices`;
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                content,
                expiry_date: expiry || null,
                schedule_times: scheduleTimes,
                enabled
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '저장 실패');
        }
        
        closeModal('notice-modal');
        loadNotices();
        alert('저장되었습니다');
    } catch (error) {
        alert(`오류: ${error.message}`);
    }
}

async function deleteNotice(id) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/notices/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('삭제 실패');
        }
        
        loadNotices();
        alert('삭제되었습니다');
    } catch (error) {
        alert(`오류: ${error.message}`);
    }
}

// ============================================
// 로그 조회
// ============================================

function showLogTab(type) {
    document.querySelectorAll('.log-content').forEach(tab => {
        tab.style.display = 'none';
    });
    document.querySelectorAll('.log-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(`${type}-logs`).style.display = 'block';
    event.target.classList.add('active');
}

async function loadFilterLogs() {
    try {
        const response = await fetch(`${API_BASE}/filter-logs?limit=100`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('조회 실패');
        }
        
        const data = await response.json();
        renderFilterLogsTable(data.data);
    } catch (error) {
        document.getElementById('filter-logs-tbody').innerHTML = 
            `<tr><td colspan="5" class="loading">오류: ${error.message}</td></tr>`;
    }
}

function renderFilterLogsTable(logs) {
    const tbody = document.getElementById('filter-logs-tbody');
    
    if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="loading">데이터가 없습니다</td></tr>';
        return;
    }
    
    tbody.innerHTML = logs.map(log => {
        // 발신자 이름 파싱 (닉네임/user_id 형식에서 닉네임만 표시)
        let senderDisplay = escapeHtml(log.sender);
        if (log.sender && log.sender.includes('/')) {
            senderDisplay = escapeHtml(log.sender.split('/')[0]);
        } else if (log.sender && /^\d+$/.test(log.sender.trim())) {
            // 숫자만 있으면 user_id이므로 그대로 표시
            senderDisplay = escapeHtml(log.sender);
        }
        
        return `
        <tr>
            <td>${formatDate(log.created_at)}</td>
            <td>${senderDisplay}</td>
            <td>${escapeHtml(log.message.substring(0, 50))}${log.message.length > 50 ? '...' : ''}</td>
            <td>${escapeHtml(log.reason)}</td>
            <td>${escapeHtml(log.word || '-')}</td>
            <td>
                <button class="btn-danger" onclick="deleteFilterLog(${log.id})">삭제</button>
            </td>
        </tr>
        `;
    }).join('');
}

async function loadWarnings() {
    try {
        const response = await fetch(`${API_BASE}/warnings`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('조회 실패');
        }
        
        const data = await response.json();
        renderWarningsTable(data.data);
    } catch (error) {
        document.getElementById('warnings-tbody').innerHTML = 
            `<tr><td colspan="3" class="loading">오류: ${error.message}</td></tr>`;
    }
}

function renderWarningsTable(warnings) {
    const tbody = document.getElementById('warnings-tbody');
    
    if (warnings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading">데이터가 없습니다</td></tr>';
        return;
    }
    
    tbody.innerHTML = warnings.map(warning => {
        // 발신자 이름 파싱 (닉네임/user_id 형식에서 닉네임만 표시)
        let senderDisplay = escapeHtml(warning.sender);
        if (warning.sender && warning.sender.includes('/')) {
            senderDisplay = escapeHtml(warning.sender.split('/')[0]);
        } else if (warning.sender && /^\d+$/.test(warning.sender.trim())) {
            // 숫자만 있으면 user_id이므로 그대로 표시
            senderDisplay = escapeHtml(warning.sender);
        }
        
        return `
        <tr>
            <td>${senderDisplay}</td>
            <td>${warning.count}회</td>
            <td>${formatDate(warning.last_warning_at)}</td>
            <td>
                <button class="btn-danger" onclick="deleteWarning('${escapeHtml(warning.sender).replace(/'/g, "\\'")}')">삭제</button>
            </td>
        </tr>
        `;
    }).join('');
}

// ============================================
// 유틸리티
// ============================================

function closeModal(modalId) {
    if (modalId === 'logs-modal') {
        closeLogsModal();
    } else {
        document.getElementById(modalId).style.display = 'none';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ko-KR');
}

// ============================================
// 로그 삭제 기능
// ============================================

async function deleteFilterLog(id) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/filter-logs/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('삭제 실패');
        }
        
        loadFilterLogs();
        alert('삭제되었습니다');
    } catch (error) {
        alert(`오류: ${error.message}`);
    }
}

async function deleteAllFilterLogs() {
    if (!confirm('모든 필터 로그를 삭제하시겠습니까?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/filter-logs`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('삭제 실패');
        }
        
        const data = await response.json();
        loadFilterLogs();
        alert(`삭제되었습니다. (${data.deleted}개)`);
    } catch (error) {
        alert(`오류: ${error.message}`);
    }
}

async function deleteWarning(sender) {
    if (!confirm('이 경고 기록을 삭제하시겠습니까?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/warnings/${encodeURIComponent(sender)}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('삭제 실패');
        }
        
        loadWarnings();
        alert('삭제되었습니다');
    } catch (error) {
        alert(`오류: ${error.message}`);
    }
}

async function deleteAllWarnings() {
    if (!confirm('모든 경고 기록을 삭제하시겠습니까?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/warnings`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('삭제 실패');
        }
        
        const data = await response.json();
        loadWarnings();
        alert(`삭제되었습니다. (${data.deleted}개)`);
    } catch (error) {
        alert(`오류: ${error.message}`);
    }
}

// 모달 외부 클릭 시 닫기
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
            if (modal.id === 'logs-modal') {
                stopAutoRefresh();
            }
        }
    });
}

// ============================================
// 로그 뷰어 기능
// ============================================

function showLogsModal() {
    document.getElementById('logs-modal').style.display = 'block';
    loadCombinedLogs(); // 기본으로 통합 로그 표시
}

function closeLogsModal() {
    document.getElementById('logs-modal').style.display = 'none';
    stopAutoRefresh();
}

function toggleAutoRefresh() {
    const checkbox = document.getElementById('auto-refresh-logs');
    if (checkbox.checked) {
        startAutoRefresh();
    } else {
        stopAutoRefresh();
    }
}

function startAutoRefresh() {
    stopAutoRefresh(); // 기존 인터벌 제거
    logsAutoRefreshInterval = setInterval(() => {
        if (currentLogType === 'server') {
            loadServerLogs();
        } else if (currentLogType === 'client') {
            loadClientLogs();
        } else {
            loadCombinedLogs();
        }
    }, 5000); // 5초마다
}

function stopAutoRefresh() {
    if (logsAutoRefreshInterval) {
        clearInterval(logsAutoRefreshInterval);
        logsAutoRefreshInterval = null;
    }
}

async function loadServerLogs() {
    currentLogType = 'server';
    const contentDiv = document.getElementById('logs-content');
    contentDiv.innerHTML = '<div class="loading">로딩 중...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/logs/server`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `서버 로그 조회 실패 (${response.status})`);
        }
        
        const data = await response.json();
        if (data.success) {
            if (data.data && data.data.length > 0) {
                renderLogs(data.data, 'server');
            } else {
                contentDiv.innerHTML = `<div class="error">${data.message || '로그가 없습니다.'}</div>`;
            }
        } else {
            contentDiv.innerHTML = `<div class="error">${data.message || data.error || '로그 조회 실패'}</div>`;
        }
    } catch (error) {
        console.error('[로그 조회 오류]', error);
        contentDiv.innerHTML = `<div class="error">오류: ${error.message}</div>`;
    }
}

async function loadClientLogs() {
    currentLogType = 'client';
    const contentDiv = document.getElementById('logs-content');
    contentDiv.innerHTML = '<div class="loading">로딩 중...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/logs/client`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `클라이언트 로그 조회 실패 (${response.status})`);
        }
        
        const data = await response.json();
        if (data.success) {
            if (data.data && data.data.length > 0) {
                renderLogs(data.data, 'client');
            } else {
                contentDiv.innerHTML = `<div class="error">${data.message || '로그가 없습니다.'}</div>`;
            }
        } else {
            contentDiv.innerHTML = `<div class="error">${data.message || data.error || '로그 조회 실패'}</div>`;
        }
    } catch (error) {
        console.error('[로그 조회 오류]', error);
        contentDiv.innerHTML = `<div class="error">오류: ${error.message}</div>`;
    }
}

async function loadCombinedLogs() {
    currentLogType = 'combined';
    const contentDiv = document.getElementById('logs-content');
    contentDiv.innerHTML = '<div class="loading">로딩 중...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/logs/combined`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `통합 로그 조회 실패 (${response.status})`);
        }
        
        const data = await response.json();
        if (data.success) {
            if (data.data && data.data.length > 0) {
                renderCombinedLogs(data.data);
            } else {
                contentDiv.innerHTML = `<div class="error">${data.message || '로그가 없습니다.'}</div>`;
            }
        } else {
            contentDiv.innerHTML = `<div class="error">${data.message || data.error || '로그 조회 실패'}</div>`;
        }
    } catch (error) {
        console.error('[로그 조회 오류]', error);
        contentDiv.innerHTML = `<div class="error">오류: ${error.message}</div>`;
    }
}

function renderLogs(logs, source) {
    const contentDiv = document.getElementById('logs-content');
    if (!logs || logs.length === 0) {
        contentDiv.innerHTML = '<div class="error">로그가 없습니다.</div>';
        return;
    }
    
    // 최신 100줄만 표시
    const displayLogs = logs.slice(-100);
    const html = displayLogs.map(log => {
        const line = typeof log === 'string' ? log : log.line;
        // 에러 로그는 빨간색으로 표시
        if (line.includes('[ERROR]') || line.includes('❌') || line.includes('오류')) {
            return `<span style="color: #f48771;">${escapeHtml(line)}</span>`;
        }
        // 경고 로그는 노란색으로 표시
        if (line.includes('[WARN]') || line.includes('⚠️') || line.includes('경고')) {
            return `<span style="color: #dcdcaa;">${escapeHtml(line)}</span>`;
        }
        // 성공 로그는 초록색으로 표시
        if (line.includes('[INFO]') && (line.includes('✅') || line.includes('성공'))) {
            return `<span style="color: #4ec9b0;">${escapeHtml(line)}</span>`;
        }
        return escapeHtml(line);
    }).join('\n');
    
    contentDiv.innerHTML = html;
    // 스크롤을 맨 아래로
    contentDiv.scrollTop = contentDiv.scrollHeight;
}

function renderCombinedLogs(logs) {
    const contentDiv = document.getElementById('logs-content');
    if (!logs || logs.length === 0) {
        contentDiv.innerHTML = '<div class="error">로그가 없습니다.</div>';
        return;
    }
    
    // 최신 100줄만 표시
    const displayLogs = logs.slice(-100);
    const html = displayLogs.map(log => {
        const source = log.source || 'unknown';
        const line = log.line || '';
        const sourceColor = source === 'server' ? '#569cd6' : '#ce9178';
        const sourceLabel = source === 'server' ? '[SERVER]' : '[CLIENT]';
        
        let lineHtml = `<span style="color: ${sourceColor};">${sourceLabel}</span> `;
        
        // 에러 로그는 빨간색으로 표시
        if (line.includes('[ERROR]') || line.includes('❌') || line.includes('오류')) {
            lineHtml += `<span style="color: #f48771;">${escapeHtml(line)}</span>`;
        }
        // 경고 로그는 노란색으로 표시
        else if (line.includes('[WARN]') || line.includes('⚠️') || line.includes('경고')) {
            lineHtml += `<span style="color: #dcdcaa;">${escapeHtml(line)}</span>`;
        }
        // 성공 로그는 초록색으로 표시
        else if (line.includes('[INFO]') && (line.includes('✅') || line.includes('성공'))) {
            lineHtml += `<span style="color: #4ec9b0;">${escapeHtml(line)}</span>`;
        }
        else {
            lineHtml += escapeHtml(line);
        }
        
        return lineHtml;
    }).join('\n');
    
    contentDiv.innerHTML = html;
    // 스크롤을 맨 아래로
    contentDiv.scrollTop = contentDiv.scrollHeight;
}

function copyLogs() {
    const contentDiv = document.getElementById('logs-content');
    const text = contentDiv.textContent || contentDiv.innerText;
    
    // 클립보드에 복사
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            alert('로그가 클립보드에 복사되었습니다.');
        }).catch(err => {
            // Fallback: 텍스트 영역 사용
            copyToClipboardFallback(text);
        });
    } else {
        copyToClipboardFallback(text);
    }
}

function copyToClipboardFallback(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    alert('로그가 클립보드에 복사되었습니다.');
}






