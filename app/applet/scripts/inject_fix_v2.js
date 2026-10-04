const fs = require('fs');
let content = fs.readFileSync('/tmp/operational_calendar.tsx.bak', 'utf-8');

// The line to replace for the display:
// We need to match exactly the string in the file.
const labelTarget = "{userGroups?.find(g => g.id === user.roleId)?.name || (user.type === 'Team' ? 'Técnico' : user.type || 'Técnico')}";
const labelReplacement = "{userTaskCounts[user.id] || 0} tarefas";

// The insert position for useMemo:
const searchStr = "// 8. Computed days for the operational period";

const insertStr = `
  const userTaskCounts = useMemo(() => {
    const counts = {};
    activeEligibleUsers.forEach(user => {
      counts[user.id] = tasks.filter(t =>
        t.assigneeIds.includes(user.id) &&
        calendarDays.some(day => isTaskOnDate(t, day.dateStr))
      ).length;
    });
    return counts;
  }, [tasks, activeEligibleUsers, calendarDays]);
`;

if (content.includes(labelTarget)) {
    content = content.replace(labelTarget, labelReplacement);
} else {
    console.error("Could not find labelTarget");
    process.exit(1);
}

if (content.includes(searchStr)) {
    content = content.replace(searchStr, searchStr + insertStr);
} else {
    console.error("Could not find searchStr");
    process.exit(1);
}

fs.writeFileSync('/app/applet/components/OperationalUserCalendar.tsx', content);
