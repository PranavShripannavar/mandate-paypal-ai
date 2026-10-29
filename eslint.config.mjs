import tseslint from 'typescript-eslint';
export default tseslint.config({ignores:['node_modules/**','dist/**','work/**','checkpoint1.mjs']},...tseslint.configs.recommended,{rules:{'@typescript-eslint/no-explicit-any':'error','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_',caughtErrors:'none'}]}});
