const fs = require('fs');
let code = fs.readFileSync('components/TicketSection.tsx', 'utf-8');

const newLogic = `
  const [serverTickets, setServerTickets] = useState<Ticket[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  useEffect(() => {
    let isMounted = true;
    const fetchTickets = async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/v1/tickets');
        const json = await res.json();
        if (json.success && isMounted) setServerTickets(json.data);
      } catch (err) {} finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchTickets();
    return () => { isMounted = false; };
  }, []);

  const activeTickets = (serverTickets.length > 0 ? serverTickets : tickets).filter(t => !t.deleted);
`;

code = code.replace(/  const activeTickets = tickets.filter\(t => !t.deleted\);/, newLogic);

fs.writeFileSync('components/TicketSection.tsx', code);
console.log('TicketSection patched');
