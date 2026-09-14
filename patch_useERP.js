const fs = require('fs');
let code = fs.readFileSync('hooks/useERP.ts', 'utf-8');

// Replace addProject
code = code.replace(/const addProject = \([^\{]*\{[\s\S]*?return newProj;\n  \};/, `const addProject = async (project: Omit<Project, 'id' | 'deleted' | 'createdDate' | 'updatedDate'>) => {
    const res = await fetch('/api/v1/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project)
    });
    const json = await res.json();
    return json.data;
  };`);

// Replace updateProject
code = code.replace(/const updateProject = \([^\{]*\{[\s\S]*?\}\n  \};/, `const updateProject = async (id: string, updates: Partial<Omit<Project, 'id' | 'createdDate'>>) => {
    await fetch(\`/api/v1/projects/\${id}\`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  };`);

// Replace deleteProject
code = code.replace(/const deleteProject = \([^\{]*\{[\s\S]*?\}\n  \};/, `const deleteProject = async (id: string) => {
    await fetch(\`/api/v1/projects/\${id}\`, {
      method: 'DELETE'
    });
  };`);

// Replace addTask
code = code.replace(/const addTask = \([^\{]*\{[\s\S]*?return newTask;\n  \};/, `const addTask = async (task: Omit<Task, 'id' | 'deleted' | 'createdDate' | 'updatedDate'>) => {
    const res = await fetch('/api/v1/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(task)
    });
    const json = await res.json();
    return json.data;
  };`);

// Replace updateTask
code = code.replace(/const updateTask = \([^\{]*\{[\s\S]*?\}\n  \};/, `const updateTask = async (id: string, updates: Partial<Omit<Task, 'id' | 'createdDate'>>) => {
    await fetch(\`/api/v1/tasks/\${id}\`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
  };`);

// Replace deleteTask
code = code.replace(/const deleteTask = \([^\{]*\{[\s\S]*?\}\n  \};/, `const deleteTask = async (id: string) => {
    await fetch(\`/api/v1/tasks/\${id}\`, {
      method: 'DELETE'
    });
  };`);
  
fs.writeFileSync('hooks/useERP.ts', code);
console.log('useERP patched');
