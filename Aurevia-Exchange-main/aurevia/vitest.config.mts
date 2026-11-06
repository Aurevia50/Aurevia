import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {configDefaults,defineConfig} from 'vitest/config';

const projectRoot=path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve:{alias:{'@':projectRoot}},
	test:{
		exclude:[...configDefaults.exclude,'tests/e2e/**'],
	},
});
