// ============================================
// Supabase 데이터베이스 관리
// ============================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// 환경 변수에서 Supabase 설정 가져오기
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('[DB] Supabase 설정이 누락되었습니다. .env 파일을 확인해주세요.');
    console.error('[DB] 필요한 환경 변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (또는 SUPABASE_ANON_KEY)');
    throw new Error('Supabase 설정이 필요합니다.');
}

// Supabase 클라이언트 생성
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('[DB] Supabase 클라이언트 초기화 완료');

// 데이터베이스 초기화 (스키마 확인)
async function initializeDatabase() {
    try {
        // 테이블 존재 여부 확인
        const { data: profanityTable, error: profanityError } = await supabase
            .from('profanity_words')
            .select('id')
            .limit(1);
        
        if (profanityError && profanityError.code !== 'PGRST116') {
            // PGRST116은 테이블이 없다는 의미
            console.error('[DB] 테이블 확인 중 오류:', profanityError.message);
            throw profanityError;
        }
        
        if (!profanityTable) {
            console.log('[DB] 테이블이 존재하지 않습니다. Supabase에서 스키마를 먼저 생성해주세요.');
            console.log('[DB] server/db/supabase_migration.sql 파일을 참고하세요.');
        } else {
            console.log('[DB] 데이터베이스 연결 성공');
        }
    } catch (error) {
        console.error('[DB] 데이터베이스 초기화 실패:', error.message);
        throw error;
    }
}

// 초기화 실행
initializeDatabase().catch(err => {
    console.error('[DB] 초기화 중 오류:', err);
});

// SQLite 호환 인터페이스 제공 (기존 코드와의 호환성을 위해)
const db = {
    // prepare().all() 호환
    prepare: function(query) {
        return {
            all: async function(...params) {
                // SELECT 쿼리를 Supabase 쿼리로 변환
                if (query.trim().toUpperCase().startsWith('SELECT')) {
                    return await executeSelect(query, params);
                }
                throw new Error('Not implemented for Supabase');
            },
            // prepare().get() 호환
            get: async function(...params) {
                const results = await this.all(...params);
                return results && results.length > 0 ? results[0] : null;
            },
            // prepare().run() 호환
            run: async function(...params) {
                // INSERT, UPDATE, DELETE 쿼리를 Supabase 쿼리로 변환
                return await executeMutation(query, params);
            }
        };
    },
    // 직접 Supabase 클라이언트 접근
    supabase: supabase
};

// SELECT 쿼리 실행 (간단한 쿼리만 지원)
async function executeSelect(query, params) {
    try {
        // 간단한 쿼리 파싱 (복잡한 쿼리는 지원하지 않음)
        const tableMatch = query.match(/FROM\s+(\w+)/i);
        if (!tableMatch) {
            throw new Error('테이블 이름을 찾을 수 없습니다: ' + query);
        }
        
        const tableName = tableMatch[1];
        let supabaseQuery = supabase.from(tableName).select('*');
        
        // WHERE 절 처리
        const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s+OFFSET|$)/i);
        if (whereMatch) {
            const whereClause = whereMatch[1].trim();
            
            // enabled = 1 또는 enabled = true 처리
            const enabledMatch = whereClause.match(/enabled\s*=\s*(1|true)/i);
            if (enabledMatch) {
                supabaseQuery = supabaseQuery.eq('enabled', true);
            } else {
                // 간단한 = 조건 처리 (type = ? 등)
                const eqMatch = whereClause.match(/(\w+)\s*=\s*\?/);
                if (eqMatch && params.length > 0) {
                    const columnName = eqMatch[1];
                    const paramValue = params[0];
                    supabaseQuery = supabaseQuery.eq(columnName, paramValue);
                    console.log(`[DB] WHERE 절 적용: ${columnName} = ${paramValue}`);
                } else {
                    console.warn(`[DB] WHERE 절 파싱 실패: ${whereClause}, params:`, params);
                }
            }
        }
        
        // ORDER BY 처리
        const orderMatch = query.match(/ORDER BY\s+(.+?)(?:\s+LIMIT|$)/i);
        if (orderMatch) {
            const orderClause = orderMatch[1];
            const descMatch = orderClause.match(/(\w+)\s+DESC/i);
            if (descMatch) {
                supabaseQuery = supabaseQuery.order(descMatch[1], { ascending: false });
            } else {
                const ascMatch = orderClause.match(/(\w+)(?:\s+ASC)?/i);
                if (ascMatch) {
                    supabaseQuery = supabaseQuery.order(ascMatch[1], { ascending: true });
                }
            }
        }
        
        // LIMIT 처리
        const limitMatch = query.match(/LIMIT\s+(\d+)/i);
        if (limitMatch) {
            supabaseQuery = supabaseQuery.limit(parseInt(limitMatch[1]));
        }
        
        // OFFSET 처리
        const offsetMatch = query.match(/OFFSET\s+(\d+)/i);
        if (offsetMatch) {
            supabaseQuery = supabaseQuery.range(
                parseInt(offsetMatch[1]),
                parseInt(offsetMatch[1]) + (limitMatch ? parseInt(limitMatch[1]) - 1 : 0)
            );
        }
        
        const { data, error } = await supabaseQuery;
        
        if (error) {
            console.error('[DB] SELECT 쿼리 오류:', error);
            console.error('[DB] 쿼리:', query);
            console.error('[DB] 파라미터:', params);
            throw error;
        }
        
        return data || [];
    } catch (error) {
        console.error('[DB] SELECT 쿼리 실행 오류:', error.message);
        throw error;
    }
}

// INSERT, UPDATE, DELETE 쿼리 실행
async function executeMutation(query, params) {
    try {
        const trimmedQuery = query.trim();
        
        if (trimmedQuery.toUpperCase().startsWith('INSERT')) {
            return await executeInsert(query, params);
        } else if (trimmedQuery.toUpperCase().startsWith('UPDATE')) {
            return await executeUpdate(query, params);
        } else if (trimmedQuery.toUpperCase().startsWith('DELETE')) {
            return await executeDelete(query, params);
        }
        
        throw new Error('지원하지 않는 쿼리 타입: ' + query);
    } catch (error) {
        console.error('[DB] Mutation 쿼리 실행 오류:', error.message);
        throw error;
    }
}

// INSERT 실행
async function executeInsert(query, params) {
    // 멀티라인 쿼리를 한 줄로 변환 (공백 정규화)
    const normalizedQuery = query.replace(/\s+/g, ' ').trim();
    const tableMatch = normalizedQuery.match(/INSERT\s+INTO\s+(\w+)\s*\((.+?)\)\s*VALUES/i);
    if (!tableMatch) {
        throw new Error('INSERT 쿼리 파싱 실패: ' + query);
    }
    
    const tableName = tableMatch[1];
    const columns = tableMatch[2].split(',').map(c => c.trim());
    
    const row = {};
    columns.forEach((col, index) => {
        if (index < params.length) {
            row[col] = params[index];
        }
    });
    
    const { data, error } = await supabase
        .from(tableName)
        .insert(row)
        .select()
        .single();
    
    if (error) {
        throw error;
    }
    
    return {
        lastInsertRowid: data.id,
        changes: 1
    };
}

// UPDATE 실행
async function executeUpdate(query, params) {
    // 멀티라인 쿼리를 한 줄로 변환 (공백 정규화)
    const normalizedQuery = query.replace(/\s+/g, ' ').trim();
    const tableMatch = normalizedQuery.match(/UPDATE\s+(\w+)\s+SET/i);
    if (!tableMatch) {
        throw new Error('UPDATE 쿼리 파싱 실패: ' + query);
    }
    
    const tableName = tableMatch[1];
    const whereMatch = normalizedQuery.match(/WHERE\s+(.+?)$/i);
    
    if (!whereMatch) {
        throw new Error('WHERE 절이 필요합니다: ' + query);
    }
    
    const whereClause = whereMatch[1];
    const setMatch = normalizedQuery.match(/SET\s+(.+?)(?:\s+WHERE|$)/i);
    
    if (!setMatch) {
        throw new Error('SET 절 파싱 실패: ' + query);
    }
    
    const updates = {};
    const setClause = setMatch[1];
    const assignments = setClause.split(',').map(a => a.trim());
    
    let paramIndex = 0;
    assignments.forEach(assignment => {
        const eqMatch = assignment.match(/(\w+)\s*=\s*\?/);
        if (eqMatch && paramIndex < params.length) {
            updates[eqMatch[1]] = params[paramIndex];
            paramIndex++;
        } else if (assignment.includes('CURRENT_TIMESTAMP')) {
            // CURRENT_TIMESTAMP는 현재 시간으로 변환
            const colMatch = assignment.match(/(\w+)\s*=/);
            if (colMatch) {
                updates[colMatch[1]] = new Date().toISOString();
            }
        }
    });
    
    // WHERE 절 처리 (간단한 = 조건만)
    const whereEqMatch = whereClause.match(/(\w+)\s*=\s*\?/);
    if (!whereEqMatch || paramIndex >= params.length) {
        throw new Error('WHERE 절 파싱 실패: ' + whereClause);
    }
    
    const { data, error } = await supabase
        .from(tableName)
        .update(updates)
        .eq(whereEqMatch[1], params[paramIndex])
        .select();
    
    if (error) {
        throw error;
    }
    
    return {
        changes: data ? data.length : 0
    };
}

// DELETE 실행
async function executeDelete(query, params) {
    const tableMatch = query.match(/DELETE FROM\s+(\w+)/i);
    if (!tableMatch) {
        throw new Error('DELETE 쿼리 파싱 실패: ' + query);
    }
    
    const tableName = tableMatch[1];
    const whereMatch = query.match(/WHERE\s+(.+?)$/i);
    
    if (!whereMatch) {
        throw new Error('WHERE 절이 필요합니다: ' + query);
    }
    
    const whereClause = whereMatch[1];
    const whereEqMatch = whereClause.match(/(\w+)\s*=\s*\?/);
    
    if (!whereEqMatch || params.length === 0) {
        throw new Error('WHERE 절 파싱 실패: ' + whereClause);
    }
    
    const { data, error } = await supabase
        .from(tableName)
        .delete()
        .eq(whereEqMatch[1], params[0])
        .select();
    
    if (error) {
        throw error;
    }
    
    return {
        changes: data ? data.length : 0
    };
}

module.exports = db;
