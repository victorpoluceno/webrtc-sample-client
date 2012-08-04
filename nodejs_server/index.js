// Server Node.js with socket.IO

/**
 * Declare the server HTTP listen to the port 8888
 */
var http = require("http");

var server = http.createServer();
var app = server.listen(8888);

/**
 * Import socket.io module on the server HTTP
 */
var io = require('socket.io').listen(app);

/**
* When a user connects
*/
io.sockets.on('connection', function (client) {
	var initiator = true;
	var room = '';

	/**
	 * When a user is invited
	 * join the room
	 * @param {int} invitation : room number
	 */
	client.on("invite", function(invitation){
		room = invitation;
		initiator = false;
		client.join(room);
	});

	/**
	 * If you are the first user to connect create room
	 */
	if(initiator){
		room = Math.floor(Math.random()*1000001).toString();
		client.emit('getRoom', {roomId : room});
		client.join(room);
	}

	/**
	 * When a user send a SDP message
	 * broadcast to all users in the room
	 */
  	client.on('message', function(message) {
        var broadcastMessage = message;
        client.broadcast.to(room).send(broadcastMessage);
    });

    /**
	 * When a user changes for a previous slide
	 * broadcast to all users in the room
	 */
    client.on('prevSlide', function() {
    	client.broadcast.to(room).emit('prevSlide');
    });

    /**
	 * When a user changes for a next slide
	 * broadcast to all users in the room
	 */
    client.on('nextSlide', function() {
    	client.broadcast.to(room).emit('nextSlide');
    });

	/**
	 * When the user hang up
	 * broadcast bye signal to all users in the room
	 */
 	client.on('exit', function(){
    	client.broadcast.to(room).emit('bye');
  	});

  	/**
	 * When the user close the application
	 * broadcast close signal to all users in the room
	 */
  	client.on('disconnect', function(){
    	client.broadcast.to(room).emit('close');
  	});
});