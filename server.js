const express = require('express');
const app = express();
const path = require('path');
const public = path.join(__dirname, 'dist');
const port = process.env.PORT || 5000;

app.use(express.static(public));
app.get('/', function(req, res) {
    res.sendFile(path.join(public ,'index.html'));
})

app.get('admin', function(req, res) {
    res.sendFile(path.join(public ,'admin','index.html'));
})

app.post('admin/panel.html', function(req, res) {
    res.sendFile(path.join(public, 'admin', 'panel.html'));
})

app.listen(port, (req, res) => {
    console.log(`Listening on port ${port}`);
});
