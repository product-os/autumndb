import * as skhema from 'skhema';
import * as errors from './errors';

// TS-TODO: Is this 100% necessary??
(skhema as any).SchemaMismatch = errors.JellyfishSchemaMismatch;

// TS-TODO: the skhema lib expects v6 schemas, rather than the JsonSchemaQL schemas
// used in Jellyfish
export default skhema;
