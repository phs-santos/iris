// Lint (RNF-15). O formato é do Prettier; aqui ficam só as regras que acham defeito de verdade.
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'

export default tseslint.config(
    { ignores: ['out/', 'dist/', 'dist-diag/', 'coverage/', 'node_modules/', 'docs/', 'docker/', 'patches/'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    ...vue.configs['flat/recommended'],
    {
        languageOptions: { globals: { ...globals.browser, ...globals.node } },
        rules: {
            // Regras de arquitetura do projeto (docs/SEGURANCA.md).
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'vue/no-v-html': 'error',
            'no-restricted-properties': [
                'error',
                { property: 'innerHTML', message: 'Use texto ou componentes; innerHTML abre espaço para injeção.' },
                { property: 'outerHTML', message: 'Use texto ou componentes; outerHTML abre espaço para injeção.' }
            ],
            eqeqeq: ['error', 'always'],
            // Usado só onde o formato vem de fora (erros do SIP.js, eventos do electron-updater).
            '@typescript-eslint/no-explicit-any': 'off',
            // O TypeScript já garante que os switch sobre uniões cobrem todos os casos.
            'vue/return-in-computed-property': 'off',
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            // O Prettier decide o formato dos modelos do Vue.
            'vue/html-indent': 'off',
            'vue/max-attributes-per-line': 'off',
            'vue/singleline-html-element-content-newline': 'off',
            'vue/multiline-html-element-content-newline': 'off',
            'vue/html-self-closing': 'off',
            'vue/html-closing-bracket-newline': 'off',
            'vue/first-attribute-linebreak': 'off',
            'vue/multi-word-component-names': 'off',
            // Os modelos usam $t(); um `t` de v-for não esconde a função de tradução.
            'vue/no-template-shadow': 'off'
        }
    },
    { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: tseslint.parser } } },
    // A interface só fala com o SIP pela interface SipEngine (RNF-16).
    {
        files: ['src/renderer/src/components/**', 'src/renderer/src/stores/**', 'src/renderer/src/App.vue'],
        rules: {
            'no-restricted-imports': [
                'error',
                { paths: [{ name: 'easy-sipjs', message: 'Use o SipEngine de @renderer/sip (RNF-16).' }] }
            ]
        }
    }
)
