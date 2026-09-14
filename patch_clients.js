const fs = require('fs');
let code = fs.readFileSync('components/ClientSection.tsx', 'utf-8');

const newLogic = `
  const [serverClients, setServerClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    let isMounted = true;
    const fetchClients = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/v1/clients');
        const json = await res.json();
        if (json.success && isMounted) setServerClients(json.data);
      } catch (err) {} finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchClients();
    return () => { isMounted = false; };
  }, []);

  const activeClients = (serverClients.length > 0 ? serverClients : (clients || [])).filter(c => c && (showDeleted ? c.deleted : !c.deleted));
`;

code = code.replace(/  const activeClients = \(clients \|\| \[\]\)\.filter\(c => c && \(showDeleted \? c\.deleted : !c\.deleted\)\);/, newLogic);

fs.writeFileSync('components/ClientSection.tsx', code);
console.log('ClientSection patched');
