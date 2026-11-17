/** All readers and writers must select the same configuration row, including
 * installations which contain historical duplicate rows. Never delete data
 * while resolving the active record. */
export function configurationReadQuery(client: any, columns = '*') {
  return client.from('app_configuration').select(columns)
    .order('id', { ascending: true }).limit(1);
}
