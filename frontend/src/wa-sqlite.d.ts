declare module 'wa-sqlite/dist/wa-sqlite.mjs' {
  export default function SQLiteESMFactory(): Promise<any>;
}
declare module 'wa-sqlite' {
  export function Factory(module: any): any;
  export const SQLITE_ROW: number;
  export const SQLITE_DONE: number;
}
declare module 'wa-sqlite/src/examples/MemoryVFS.js' {
  export class MemoryVFS {
    constructor();
  }
}
