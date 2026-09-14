const fs = require('fs');
let code = fs.readFileSync('components/ProjectSection.tsx', 'utf-8');

code = code.replace(/const newProj = addProject\(payload\);/, 'const newProj = await addProject(payload);');
code = code.replace(/updateProject\(editingId, payload\);/, 'await updateProject(editingId, payload);');
code = code.replace(/const handleSaveProject = \(\) => \{/, 'const handleSaveProject = async () => {');

fs.writeFileSync('components/ProjectSection.tsx', code);
console.log('ProjectSection async patched');
