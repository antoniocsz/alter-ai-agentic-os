// Tabela dos planos do coordenador (task 137). Sem dependências: o db.js migra por aqui.
export function ensurePlanSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      feature TEXT NOT NULL,
      status TEXT NOT NULL,
      tool TEXT,
      run_id TEXT,
      plan_json TEXT NOT NULL,
      tasks_json TEXT,
      warnings_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plans_feature ON plans(feature);
  `)
}
