module.exports = {
    presets: [
        '@babel/preset-env',
        '@babel/preset-react',
        '@babel/cli',
        '@babel/core'
    ],
    plugins: [
        '@babel/plugin-proposal-nullish-coalescing-operator',
        '@babel/plugin-proposal-optional-chaining'
    ]
};
