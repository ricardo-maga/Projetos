const fs = require('fs');
let code = fs.readFileSync('components/ProjectSection.tsx', 'utf-8');

// Add refreshTrigger to state
code = code.replace(/  const \[isLoadingProjects, setIsLoadingProjects\] = useState\(false\);/, 
`  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);`);

// Add refreshTrigger to dependency array
code = code.replace(/, selectedProjectId, projects\]\); \/\/ Re-run if 'projects' prop changes as a fallback refresh/, 
`, selectedProjectId, projects, refreshTrigger]); // Re-run if 'projects' prop changes as a fallback refresh`);

// Add refreshTrigger inside handleSubmit
code = code.replace(/      setIsEditing\(false\);\n      setIsFormOpen\(false\);/, 
`      setIsEditing(false);
      setIsFormOpen(false);
      setRefreshTrigger(prev => prev + 1);`);

fs.writeFileSync('components/ProjectSection.tsx', code);
console.log('ProjectSection refreshTrigger patched');
