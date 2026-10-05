export async function reserveTicketNumber(database: any): Promise<string> {
  const { data, error } = await database.rpc('reserve_ticket_number');
  if (error || typeof data !== 'string' || !/^TCK-\d{4}-\d+$/.test(data)) {
    throw new Error('Não foi possível reservar o número do ticket.');
  }
  return data;
}
