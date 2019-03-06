const express = require('express');
const app = express();
const path = require('path');
const public = path.join(__dirname, 'dist');

app.use(express.static(public));

app.get('/', function(req, res) {
    res.sendFile(path.join(public ,'index.html'));
})

app.listen(1234);
console.log("Listening on port 1234");