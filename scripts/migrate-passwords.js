const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Supabase credentials not set in environment.");
  process.exit(1);
}

const supabase = createClient(url, key);

async function migratePasswords() {
  console.log("Iniciando migração de passwords para bcrypt...");
  const { data: users, error } = await supabase.from("users").select("id, email, password");
  if (error) {
    console.error("Erro ao obter utilizadores:", error);
    process.exit(1);
  }

  let updatedCount = 0;
  for (const u of users) {
    const pwd = u.password;
    if (pwd && (pwd.startsWith("$2a$") || pwd.startsWith("$2b$") || pwd.startsWith("$2y$"))) {
      continue;
    }
    let defaultPlain = "12345";
    if (pwd && pwd.length !== 64 && !pwd.match(/^[a-f0-9]{64}$/i)) {
      defaultPlain = pwd;
    }
    const bcryptHash = bcrypt.hashSync(defaultPlain, 10);
    const { error: updateErr } = await supabase.from("users").update({ password: bcryptHash }).eq("id", u.id);
    if (updateErr) {
      console.error(`Erro ao atualizar ${u.email}:`, updateErr);
    } else {
      console.log(`Utilizador ${u.email} migrado para hash bcrypt.`);
      updatedCount++;
    }
  }

  console.log(`Migração concluída com sucesso. Total de utilizadores atualizados: ${updatedCount}`);
}

migratePasswords().catch(console.error);
