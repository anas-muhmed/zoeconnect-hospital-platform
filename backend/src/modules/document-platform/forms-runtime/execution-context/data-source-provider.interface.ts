export interface IDataSourceProvider {
  /**
   * The unique namespace for this data source, e.g. 'patient' or 'vitals'.
   * Variables in the form will be prefixed with this namespace, e.g. 'patient.age'.
   */
  namespace: string;

  /**
   * Fetches data for the given document instance.
   * Return a flat or nested record of data that will be available to the rule engine and variable interpolation.
   */
  fetchData(context: DataSourceContext): Promise<Record<string, unknown>>;
}

export interface DataSourceContext {
  documentInstanceId: string;
  patientId?: string | null;
  visitId?: string | null;
  encounterId?: string | null;
  branchId?: string | null;
  departmentCode?: string | null;
}
