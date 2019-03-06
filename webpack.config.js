module.exports = {
    module: {
        rules: [
            {
                test: /\.(js|jsx)/, 
                exclude: /node_mudules/,
                use: {
                    loader: "babel-loader"
                }
            },
            {
                test: /\.css$/,
                exclude: /node_mudules/,
                use: ["style-loader", "css-loader"]
            }
        ]
    }
}