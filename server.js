const express = require('express');
const app = express();
const path = require('path');
var bodyParser = require('body-parser');
const public = path.join(__dirname, 'dist');
const port = process.env.PORT || 5000;

function validToken(token) {
    if (token === "iambrennen!") {
        return true
    }
    return false
}

//app.use(processReq);
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
app.use(express.static(public));

app.post('/admin/panel.html', function(req, res) {
    console.log("post received: %s", req.body.AdminToken);
    if (validToken(req.body.AdminToken)) {
        res.sendFile(path.join(public, 'admin', 'panel.html'));
    } else {
        res.sendFile(path.join(public ,'admin','index.html'))
    }
})

app.get('/', function(req, res) {
    res.sendFile(path.join(public ,'index.html'));
})

app.get('admin', function(req, res) {
    res.sendFile(path.join(public ,'admin','index.html'));
})

app.get('blog', function(req, res) {
    res.sendFile(path.join(public ,'admin','index.html'));
})

app.listen(port, (req, res) => {
    console.log(`Listening on port ${port}`);
});
