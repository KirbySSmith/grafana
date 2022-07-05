import { DataSourceInstanceSettings, ScopedVars } from '@grafana/data';
import { LanguageCompletionProvider } from '@grafana/experimental';
import { TemplateSrv } from '@grafana/runtime';
import { SqlDatasource } from 'app/features/plugins/sql/datasource/SqlDatasource';
import { DB, ResponseParser, SQLQuery, SQLSelectableValue, SQLOptions } from 'app/features/plugins/sql/types';

import { getSchema, showDatabases, showTables } from './MSSqlMetaQuery';
import { MSSqlQueryModel } from './MSSqlQueryModel';
import { MSSqlResponseParser } from './response_parser';
import { fetchColumns, fetchTables, getSqlCompletionProvider } from './sqlCompletionProvider';
import { getIcon, getRAQBType, toRawSql } from './sqlUtil';

export class MssqlDatasource extends SqlDatasource {
  completionProvider: LanguageCompletionProvider | undefined = undefined;
  constructor(instanceSettings: DataSourceInstanceSettings<SQLOptions>, templateSrv?: TemplateSrv) {
    super(instanceSettings, templateSrv);
  }

  getQueryModel(target?: SQLQuery, templateSrv?: TemplateSrv, scopedVars?: ScopedVars): MSSqlQueryModel {
    return new MSSqlQueryModel(target, templateSrv, scopedVars);
  }

  getResponseParser(): ResponseParser {
    return new MSSqlResponseParser();
  }

  async fetchDatasets(): Promise<string[]> {
    const datasets = await this.metricFindQuery(showDatabases(), {});
    return datasets.map((t) => t.text);
  }

  async fetchTables(dataset?: string): Promise<string[]> {
    const tables = await this.metricFindQuery(showTables(dataset), {});
    return tables.map((t) => t.text);
  }

  async fetchFields(query: SQLQuery): Promise<SQLSelectableValue[]> {
    const schema = await this.runSql<{ column: string; type: string }>(getSchema(query.table));
    const result: SQLSelectableValue[] = [];
    for (let i = 0; i < schema.length; i++) {
      const column = schema.fields.column.values.get(i);
      const type = schema.fields.type.values.get(i);
      result.push({ label: column, value: column, type, icon: getIcon(type), raqbFieldType: getRAQBType(type) });
    }
    return result;
  }

  getSqlCompletionProvider(db: DB): LanguageCompletionProvider {
    if (this.completionProvider !== undefined) {
      return this.completionProvider;
    }
    const args = {
      getColumns: { current: (query: SQLQuery) => fetchColumns(db, query) },
      getTables: { current: (dataset?: string) => fetchTables(db, dataset) },
    };
    this.completionProvider = getSqlCompletionProvider(args);
    return this.completionProvider;
  }

  getDB(): DB {
    return {
      init: () => Promise.resolve(true),
      datasets: () => this.fetchDatasets(),
      tables: (dataset?: string) => this.fetchTables(dataset),
      getSqlCompletionProvider: () => this.getSqlCompletionProvider(this.db),
      fields: (query: SQLQuery) => this.fetchFields(query),
      validateQuery: (query) =>
        Promise.resolve({ isError: false, isValid: true, query, error: '', rawSql: query.rawSql }),
      dsID: () => this.id,
      dispose: (dsID?: string) => {},
      toRawSql,
      lookup: async (path?: string) => {
        if (!path) {
          const datasets = await this.fetchDatasets();
          return datasets.map((d) => ({ name: d, completion: `${d}.` }));
        } else {
          const parts = path.split('.').filter((s: string) => s);
          if (parts.length > 2) {
            return [];
          }
          if (parts.length === 1) {
            const tables = await this.fetchTables(parts[0]);
            return tables.map((t) => ({ name: t, completion: `${t}\`` }));
          } else {
            return [];
          }
        }
      },
    };
  }
}
