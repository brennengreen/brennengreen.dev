import * as fs from 'fs';
import * as path from 'path';

const POSTS_FOLDER = path.join(__dirname, 'posts');

fs.readdir(POSTS_FOLDER, function (err, files) {
	if (err) { return console.log('Unable to scan director: ' + err);}

	files.forEach( function(file) {
		console.log(file);
	})
})
