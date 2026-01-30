#!/usr/bin/env python3
"""
카카오톡 DB 파일 분석 스크립트
- 테이블 구조 파악
- 반응 관련 데이터 분석
- 표준 문서 생성
"""
import sqlite3
import json
import os
import sys
from datetime import datetime
from collections import defaultdict

# 분석할 DB 파일 경로
DB_PATH = None
DB_PATH2 = None

# 출력 디렉토리
OUTPUT_DIR = "db_analysis_output"
OUTPUT_SUFFIX = ""  # 파일명 접미사 (예: "_new")

def ensure_output_dir():
    """출력 디렉토리 생성"""
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"[출력] 디렉토리 생성: {OUTPUT_DIR}")

def get_table_structure(conn, table_name):
    """테이블 구조 조회"""
    cursor = conn.cursor()
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()
    
    structure = {
        'name': table_name,
        'columns': []
    }
    
    for col in columns:
        col_info = {
            'cid': col[0],
            'name': col[1],
            'type': col[2],
            'notnull': bool(col[3]),
            'default_value': col[4],
            'pk': bool(col[5])
        }
        structure['columns'].append(col_info)
    
    return structure

def get_table_row_count(conn, table_name):
    """테이블 레코드 수 조회"""
    cursor = conn.cursor()
    try:
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        return cursor.fetchone()[0]
    except:
        return 0

def get_sample_records(conn, table_name, limit=5):
    """샘플 레코드 조회"""
    cursor = conn.cursor()
    try:
        cursor.execute(f"SELECT * FROM {table_name} LIMIT {limit}")
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        
        samples = []
        for row in rows:
            record = {}
            for i, col_name in enumerate(columns):
                value = row[i]
                # JSON 필드는 파싱 시도
                if isinstance(value, str) and (col_name in ['v', 'supplement', 'attachment', 'private_meta']):
                    try:
                        value = json.loads(value)
                    except:
                        pass
                record[col_name] = value
            samples.append(record)
        
        return samples
    except Exception as e:
        return f"Error: {e}"

def analyze_reaction_data(conn):
    """반응 데이터 분석"""
    cursor = conn.cursor()
    
    analysis = {
        'v_field_analysis': {},
        'supplement_analysis': {},
        'reaction_messages': [],
        'reaction_types': defaultdict(int),
        'reaction_stats': {
            'total_messages_with_reactions': 0,
            'total_reactions': 0,
            'reaction_distribution': defaultdict(int)
        }
    }
    
    # chat_logs 테이블 확인
    try:
        # v 필드가 있는지 확인
        cursor.execute("PRAGMA table_info(chat_logs)")
        columns = [col[1] for col in cursor.fetchall()]
        
        has_v = 'v' in columns
        has_supplement = 'supplement' in columns
        has_type = 'type' in columns
        
        if not has_v:
            analysis['error'] = "chat_logs 테이블에 'v' 필드가 없습니다."
            return analysis
        
        # v 필드 샘플 분석
        print("[분석] v 필드 샘플 조회 중...")
        # 모든 v 필드가 있는 메시지 조회 (LIMIT 제거하여 전체 확인)
        cursor.execute("SELECT _id, v, supplement, type, message, created_at FROM chat_logs WHERE v IS NOT NULL AND v != '' ORDER BY created_at DESC")
        v_samples = cursor.fetchall()
        print(f"[분석] v 필드가 있는 메시지: {len(v_samples)}개")
        
        v_field_samples = []
        for row in v_samples:
            msg_id, v_field, supplement, msg_type, message, created_at = row
            
            v_data = None
            if v_field:
                try:
                    if isinstance(v_field, str):
                        v_data = json.loads(v_field)
                    else:
                        v_data = v_field
                except:
                    v_data = v_field
            
            supplement_data = None
            if supplement:
                try:
                    if isinstance(supplement, str):
                        supplement_data = json.loads(supplement)
                    else:
                        supplement_data = supplement
                except:
                    supplement_data = supplement
            
            # defaultEmoticonsCount 확인
            reaction_count = 0
            if isinstance(v_data, dict):
                reaction_count = v_data.get('defaultEmoticonsCount', 0)
            
            if reaction_count > 0 or (supplement_data and isinstance(supplement_data, dict) and 'reactions' in supplement_data):
                v_field_samples.append({
                    'msg_id': msg_id,
                    'v': v_data,
                    'supplement': supplement_data,
                    'type': msg_type,
                    'message': message[:50] if message else None,
                    'created_at': created_at,
                    'reaction_count': reaction_count
                })
                
                # 반응 타입 분석
                if isinstance(supplement_data, dict):
                    reactions = supplement_data.get('reactions', [])
                    if isinstance(reactions, list):
                        for reaction in reactions:
                            if isinstance(reaction, dict):
                                rtype = reaction.get('type') or reaction.get('emoType') or reaction.get('reaction') or 'unknown'
                                analysis['reaction_types'][rtype] += 1
                
                analysis['reaction_stats']['total_messages_with_reactions'] += 1
                analysis['reaction_stats']['total_reactions'] += reaction_count
        
        analysis['v_field_analysis']['samples'] = v_field_samples[:20]  # 최대 20개만 저장
        
        # v 필드 구조 분석
        if v_field_samples:
            first_v = v_field_samples[0]['v']
            if isinstance(first_v, dict):
                analysis['v_field_analysis']['structure'] = {
                    'keys': list(first_v.keys()),
                    'sample_keys': {k: type(v).__name__ for k, v in first_v.items()}
                }
        
        # supplement 구조 분석
        supplement_samples = [s['supplement'] for s in v_field_samples if s['supplement']]
        if supplement_samples:
            first_supplement = supplement_samples[0]
            if isinstance(first_supplement, dict):
                analysis['supplement_analysis']['structure'] = {
                    'keys': list(first_supplement.keys()),
                    'sample_keys': {k: type(v).__name__ for k, v in first_supplement.items()}
                }
                
                # reactions 필드 상세 분석
                if 'reactions' in first_supplement:
                    reactions_sample = first_supplement['reactions']
                    if isinstance(reactions_sample, list) and reactions_sample:
                        analysis['supplement_analysis']['reaction_structure'] = {
                            'keys': list(reactions_sample[0].keys()) if isinstance(reactions_sample[0], dict) else None,
                            'sample': reactions_sample[0] if isinstance(reactions_sample[0], dict) else None
                        }
        
        # 반응 통계
        cursor.execute("""
            SELECT COUNT(*) 
            FROM chat_logs 
            WHERE v IS NOT NULL AND v != ''
        """)
        total_with_v = cursor.fetchone()[0]
        
        analysis['reaction_stats']['total_messages_with_v'] = total_with_v
        
    except Exception as e:
        analysis['error'] = f"반응 데이터 분석 중 오류: {e}"
        import traceback
        analysis['traceback'] = traceback.format_exc()
    
    return analysis

def analyze_all_tables(conn, db_name="main"):
    """모든 테이블 분석"""
    cursor = conn.cursor()
    
    # 테이블 목록 조회
    cursor.execute(f"SELECT name FROM {db_name}.sqlite_master WHERE type='table' ORDER BY name")
    tables = [row[0] for row in cursor.fetchall()]
    
    analysis = {
        'database': db_name,
        'tables': []
    }
    
    for table_name in tables:
        print(f"[분석] 테이블: {table_name}")
        
        try:
            structure = get_table_structure(conn, table_name)
            row_count = get_table_row_count(conn, table_name)
            samples = get_sample_records(conn, table_name, limit=3)
            
            table_info = {
                'name': table_name,
                'structure': structure,
                'row_count': row_count,
                'samples': samples
            }
            
            analysis['tables'].append(table_info)
        except Exception as e:
            table_info = {
                'name': table_name,
                'error': str(e)
            }
            analysis['tables'].append(table_info)
    
    return analysis

def generate_markdown_documentation(main_analysis, db2_analysis, reaction_analysis):
    """마크다운 문서 생성"""
    doc = []
    
    doc.append("# 카카오톡 DB 구조 분석 문서")
    doc.append("")
    doc.append(f"**생성 일시**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    doc.append("")
    doc.append("---")
    doc.append("")
    
    # 1. 데이터베이스 개요
    doc.append("## 1. 데이터베이스 개요")
    doc.append("")
    doc.append("카카오톡은 두 개의 SQLite 데이터베이스 파일을 사용합니다:")
    doc.append("")
    doc.append("- **KakaoTalk.db**: 메인 데이터베이스 (메시지, 채팅방 정보)")
    doc.append("- **KakaoTalk2.db**: 보조 데이터베이스 (친구 목록, 오픈채팅 멤버 등)")
    doc.append("")
    doc.append("---")
    doc.append("")
    
    # 2. 주요 테이블 구조
    doc.append("## 2. 주요 테이블 구조")
    doc.append("")
    
    # KakaoTalk.db 테이블
    doc.append("### 2.1 KakaoTalk.db")
    doc.append("")
    for table_info in main_analysis.get('tables', []):
        if 'error' in table_info:
            doc.append(f"#### {table_info['name']}")
            doc.append("")
            doc.append(f"⚠️ 오류: {table_info['error']}")
            doc.append("")
            continue
        
        doc.append(f"#### {table_info['name']}")
        doc.append("")
        doc.append(f"- **레코드 수**: {table_info['row_count']:,}개")
        doc.append("")
        doc.append("**컬럼 구조**:")
        doc.append("")
        doc.append("| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |")
        doc.append("|--------|------|----------|--------|-----|")
        
        for col in table_info['structure']['columns']:
            col_name = col['name']
            col_type = col['type']
            notnull = "✓" if col['notnull'] else ""
            default_val = col['default_value'] or ""
            pk = "✓" if col['pk'] else ""
            
            doc.append(f"| `{col_name}` | `{col_type}` | {notnull} | `{default_val}` | {pk} |")
        
        doc.append("")
        
        # 샘플 데이터
        if table_info['samples'] and not isinstance(table_info['samples'], str):
            doc.append("**샘플 데이터**:")
            doc.append("")
            for i, sample in enumerate(table_info['samples'][:2], 1):
                doc.append(f"**샘플 {i}**:")
                doc.append("```json")
                doc.append(json.dumps(sample, ensure_ascii=False, indent=2, default=str))
                doc.append("```")
                doc.append("")
        
        doc.append("---")
        doc.append("")
    
    # KakaoTalk2.db 테이블
    if db2_analysis:
        doc.append("### 2.2 KakaoTalk2.db")
        doc.append("")
        for table_info in db2_analysis.get('tables', []):
            if 'error' in table_info:
                continue
            
            doc.append(f"#### {table_info['name']}")
            doc.append("")
            doc.append(f"- **레코드 수**: {table_info['row_count']:,}개")
            doc.append("")
            doc.append("**컬럼 구조**:")
            doc.append("")
            doc.append("| 컬럼명 | 타입 | NOT NULL | 기본값 | PK |")
            doc.append("|--------|------|----------|--------|-----|")
            
            for col in table_info['structure']['columns']:
                col_name = col['name']
                col_type = col['type']
                notnull = "✓" if col['notnull'] else ""
                default_val = col['default_value'] or ""
                pk = "✓" if col['pk'] else ""
                
                doc.append(f"| `{col_name}` | `{col_type}` | {notnull} | `{default_val}` | {pk} |")
            
            doc.append("")
            doc.append("---")
            doc.append("")
    
    # 3. 반응 데이터 분석
    doc.append("## 3. 반응(Reaction) 데이터 분석")
    doc.append("")
    
    if 'error' in reaction_analysis:
        doc.append(f"⚠️ 오류: {reaction_analysis['error']}")
        doc.append("")
    else:
        # v 필드 분석
        doc.append("### 3.1 `v` 필드 구조")
        doc.append("")
        doc.append("`chat_logs` 테이블의 `v` 필드는 메시지의 메타데이터를 JSON 형식으로 저장합니다.")
        doc.append("")
        
        if 'structure' in reaction_analysis.get('v_field_analysis', {}):
            v_structure = reaction_analysis['v_field_analysis']['structure']
            doc.append("**주요 키**:")
            doc.append("")
            for key in v_structure['keys']:
                key_type = v_structure['sample_keys'].get(key, 'unknown')
                doc.append(f"- `{key}`: {key_type}")
            doc.append("")
            
            doc.append("**반응 관련 키**:")
            doc.append("")
            doc.append("- `defaultEmoticonsCount`: 반응 개수 (정수)")
            doc.append("")
        
        # supplement 필드 분석
        doc.append("### 3.2 `supplement` 필드 구조")
        doc.append("")
        doc.append("`chat_logs` 테이블의 `supplement` 필드는 메시지의 추가 정보를 JSON 형식으로 저장합니다.")
        doc.append("반응의 상세 정보는 여기에 포함됩니다.")
        doc.append("")
        
        if 'structure' in reaction_analysis.get('supplement_analysis', {}):
            supp_structure = reaction_analysis['supplement_analysis']['structure']
            doc.append("**주요 키**:")
            doc.append("")
            for key in supp_structure['keys']:
                key_type = supp_structure['sample_keys'].get(key, 'unknown')
                doc.append(f"- `{key}`: {key_type}")
            doc.append("")
            
            if 'reaction_structure' in reaction_analysis.get('supplement_analysis', {}):
                reaction_struct = reaction_analysis['supplement_analysis']['reaction_structure']
                doc.append("**`reactions` 배열 구조**:")
                doc.append("")
                if reaction_struct.get('keys'):
                    doc.append("| 필드명 | 설명 |")
                    doc.append("|--------|------|")
                    for key in reaction_struct['keys']:
                        doc.append(f"| `{key}` | - |")
                    doc.append("")
                
                if reaction_struct.get('sample'):
                    doc.append("**샘플 반응 데이터**:")
                    doc.append("```json")
                    doc.append(json.dumps(reaction_struct['sample'], ensure_ascii=False, indent=2, default=str))
                    doc.append("```")
                    doc.append("")
        
        # 반응 통계
        doc.append("### 3.3 반응 통계")
        doc.append("")
        stats = reaction_analysis.get('reaction_stats', {})
        doc.append(f"- **v 필드가 있는 메시지 수**: {stats.get('total_messages_with_v', 0):,}개")
        doc.append(f"- **반응이 있는 메시지 수**: {stats.get('total_messages_with_reactions', 0):,}개")
        doc.append(f"- **총 반응 개수**: {stats.get('total_reactions', 0):,}개")
        doc.append("")
        
        # 반응 타입 분포
        if reaction_analysis.get('reaction_types'):
            doc.append("**반응 타입 분포**:")
            doc.append("")
            for rtype, count in sorted(reaction_analysis['reaction_types'].items(), key=lambda x: x[1], reverse=True):
                doc.append(f"- `{rtype}`: {count}개")
            doc.append("")
        
        # 샘플 데이터
        if reaction_analysis.get('v_field_analysis', {}).get('samples'):
            doc.append("### 3.4 반응 데이터 샘플")
            doc.append("")
            samples = reaction_analysis['v_field_analysis']['samples'][:5]
            for i, sample in enumerate(samples, 1):
                doc.append(f"**샘플 {i}** (msg_id: {sample['msg_id']}):")
                doc.append("")
                doc.append("```json")
                sample_data = {
                    'msg_id': sample['msg_id'],
                    'reaction_count': sample['reaction_count'],
                    'v': sample['v'],
                    'supplement': sample['supplement']
                }
                doc.append(json.dumps(sample_data, ensure_ascii=False, indent=2, default=str))
                doc.append("```")
                doc.append("")
        
        doc.append("---")
        doc.append("")
    
    # 4. 반응 감지 구현 가이드
    doc.append("## 4. 반응 감지 구현 가이드")
    doc.append("")
    doc.append("### 4.1 반응 감지 방법")
    doc.append("")
    doc.append("반응은 다음 두 가지 방법으로 감지할 수 있습니다:")
    doc.append("")
    doc.append("#### 방법 1: `v` 필드의 `defaultEmoticonsCount` 확인")
    doc.append("")
    doc.append("```python")
    doc.append("# v 필드 파싱")
    doc.append("v_data = json.loads(v_field) if isinstance(v_field, str) else v_field")
    doc.append("reaction_count = v_data.get('defaultEmoticonsCount', 0)")
    doc.append("")
    doc.append("if reaction_count > 0:")
    doc.append("    print(f'반응 {reaction_count}개 발견')")
    doc.append("```")
    doc.append("")
    
    doc.append("#### 방법 2: `supplement` 필드의 `reactions` 배열 확인")
    doc.append("")
    doc.append("```python")
    doc.append("# supplement 필드 파싱")
    doc.append("supplement_data = json.loads(supplement) if isinstance(supplement, str) else supplement")
    doc.append("reactions = supplement_data.get('reactions', [])")
    doc.append("")
    doc.append("if reactions:")
    doc.append("    for reaction in reactions:")
    doc.append("        reaction_type = reaction.get('type')")
    doc.append("        reactor_id = reaction.get('userId')")
    doc.append("        print(f'반응 타입: {reaction_type}, 반응자: {reactor_id}')")
    doc.append("```")
    doc.append("")
    
    doc.append("### 4.2 반응 감지 SQL 쿼리")
    doc.append("")
    doc.append("```sql")
    doc.append("-- 반응이 있는 메시지 조회")
    doc.append("SELECT _id, v, supplement, type, message, created_at")
    doc.append("FROM chat_logs")
    doc.append("WHERE v IS NOT NULL AND v != ''")
    doc.append("  AND json_extract(v, '$.defaultEmoticonsCount') > 0")
    doc.append("ORDER BY created_at DESC")
    doc.append("LIMIT 100;")
    doc.append("```")
    doc.append("")
    
    doc.append("### 4.3 반응 업데이트 감지")
    doc.append("")
    doc.append("반응은 실시간으로 업데이트되므로, 주기적으로 `v` 필드를 폴링하여 변경사항을 감지해야 합니다:")
    doc.append("")
    doc.append("```python")
    doc.append("# 마지막 확인한 반응 개수 캐시")
    doc.append("reaction_cache = {}  # msg_id -> {'count': int, 'last_check': float}")
    doc.append("")
    doc.append("# 반응 업데이트 확인")
    doc.append("def check_reaction_updates(msg_id, v_field):")
    doc.append("    v_data = json.loads(v_field) if isinstance(v_field, str) else v_field")
    doc.append("    current_count = v_data.get('defaultEmoticonsCount', 0)")
    doc.append("    ")
    doc.append("    if msg_id in reaction_cache:")
    doc.append("        cached_count = reaction_cache[msg_id]['count']")
    doc.append("        if current_count != cached_count:")
    doc.append("            # 반응 개수 변경 감지")
    doc.append("            print(f'반응 개수 변경: {cached_count} -> {current_count}')")
    doc.append("            reaction_cache[msg_id]['count'] = current_count")
    doc.append("            return True")
    doc.append("    else:")
    doc.append("        reaction_cache[msg_id] = {'count': current_count, 'last_check': time.time()}")
    doc.append("    ")
    doc.append("    return False")
    doc.append("```")
    doc.append("")
    
    doc.append("---")
    doc.append("")
    
    # 5. 참고 자료
    doc.append("## 5. 참고 자료")
    doc.append("")
    doc.append("- 기존 구현: `client/kakao_poller.py` (주석 처리된 반응 감지 로직 참고)")
    doc.append("- 반응 문서: `REACTION_LOGIC_DOCUMENTATION.md`")
    doc.append("")
    
    return "\n".join(doc)

def main():
    """메인 함수"""
    global DB_PATH, DB_PATH2, OUTPUT_SUFFIX
    
    # 명령줄 인자에서 DB 경로 받기
    if len(sys.argv) > 1:
        DB_PATH = sys.argv[1]
        if len(sys.argv) > 2:
            DB_PATH2 = sys.argv[2]
        if len(sys.argv) > 3:
            OUTPUT_SUFFIX = sys.argv[3]  # 파일명 접미사
    else:
        # 기본값: ref 폴더의 DB 파일
        script_dir = os.path.dirname(os.path.abspath(__file__))
        ref_dir = os.path.join(os.path.dirname(script_dir), 'ref')
        
        # KakaoTalk.db 찾기
        for filename in os.listdir(ref_dir):
            if filename.startswith('KakaoTalk') and filename.endswith('.db') and '2' not in filename:
                DB_PATH = os.path.join(ref_dir, filename)
                break
        
        # KakaoTalk2.db 찾기
        for filename in os.listdir(ref_dir):
            if filename.startswith('KakaoTalk2') and filename.endswith('.db'):
                DB_PATH2 = os.path.join(ref_dir, filename)
                break
    
    if not DB_PATH or not os.path.exists(DB_PATH):
        print(f"[오류] DB 파일을 찾을 수 없습니다: {DB_PATH}")
        print("[사용법] python analyze_kakao_db.py [KakaoTalk.db 경로] [KakaoTalk2.db 경로(선택)]")
        return
    
    print(f"[시작] DB 분석 시작")
    print(f"[DB 파일] {DB_PATH}")
    if DB_PATH2:
        print(f"[DB 파일2] {DB_PATH2}")
    print("")
    
    ensure_output_dir()
    
    # KakaoTalk.db 분석
    print("[분석] KakaoTalk.db 분석 중...")
    conn = sqlite3.connect(DB_PATH)
    main_analysis = analyze_all_tables(conn, "main")
    reaction_analysis = analyze_reaction_data(conn)
    conn.close()
    
    # KakaoTalk2.db 분석
    db2_analysis = None
    if DB_PATH2 and os.path.exists(DB_PATH2):
        print("[분석] KakaoTalk2.db 분석 중...")
        conn2 = sqlite3.connect(DB_PATH2)
        db2_analysis = analyze_all_tables(conn2, "main")
        conn2.close()
    
    # JSON 결과 저장
    output_data = {
        'main_db': main_analysis,
        'db2': db2_analysis,
        'reaction_analysis': reaction_analysis
    }
    
    json_output_path = os.path.join(OUTPUT_DIR, f'db_analysis{OUTPUT_SUFFIX}.json')
    with open(json_output_path, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2, default=str)
    print(f"[저장] JSON 결과: {json_output_path}")
    
    # 마크다운 문서 생성
    markdown_doc = generate_markdown_documentation(main_analysis, db2_analysis, reaction_analysis)
    md_output_path = os.path.join(OUTPUT_DIR, f'KAKAO_DB_STRUCTURE{OUTPUT_SUFFIX}.md')
    with open(md_output_path, 'w', encoding='utf-8') as f:
        f.write(markdown_doc)
    print(f"[저장] 마크다운 문서: {md_output_path}")
    
    print("")
    print("[완료] DB 분석 완료!")
    print(f"[출력 폴더] {OUTPUT_DIR}/")

if __name__ == "__main__":
    main()

