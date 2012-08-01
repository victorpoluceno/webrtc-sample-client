/////////////////////////////////////////////////////////////////
// Javascript file used to make a visio call between 2 clients //
/////////////////////////////////////////////////////////////////

//-- Global variables declarations--//
var localVideo;
var remoteVideo;
var status;  
var initiator = 0;
var message;
var url;
var localStream;
var started = false; 
var channelReady = false;
var pc;
var socket;
var room;
var pc_config = 'STUN stun.l.google.com:19302';
var started = false;
var iceUfrags = [];
var icePwds = [];
var needFormatCandidate = false;


/**
 * The first function to be launched
 * @return {void}
 */
initialize = function() {
    console.log("Initializing");
    localVideo = $("#localVideo");
    remoteVideo = $("#remoteVideo");
    status = $("#status");
    openChannel();
    getUserMedia();
}

/**
 * Declare the socket (websocket) and open it
 * declare the event attached to the socket
 * @return {void}
 */
openChannel = function() {
    socket = io.connect('http://localhost:8888/');

    socket
      .on('connect', onChannelOpened)
      .on('message', onChannelMessage)
      .on('error', onChannelError)
      .on('bye', onChannelBye)
      .on('close', onChannelClosed)
      .on('recupererMessages', recupererMessages)
      .on('recupererNouveauMessage', recupererNouveauMessage)
      .on('prevSlide', remotePrev)
      .on('nextSlide', remoteNext);
     
    /**
     * search the url address for the parameter room
     * if it exists it means you are a initiator and you don't need to request a room number
     */ 
    if(location.search.substring(1,5) == "room") {
      room = location.search.substring(6, 12); // FIXME bad code
      socket.emit("invite", room);
      initiator = 1;
    } else {
      socket.on('getRoom', function(data){
        room = data.roomId;
        console.log(room);
        resetStatus();
        initiator = 0;
      });
    }
}

/**
 * Allow to reset the status in the footer
 * @return {void}
 */
resetStatus = function() {
    
    /**
     * if you aren't the initiator it provides you a link to invite someone in the footer
     */
    if (!initiator) {
        setStatus("<div class=\"alert\">Waiting for someone to join: <a href=\""+window.location.href+"?room="+room+"\">"+window.location.href+"?room="+room+"</a></div>");
    } else {
        setStatus("Initializing...");
    }
}

/**
 * get the media (audio or video) of the user
 * @return {void}
 */
getUserMedia = function() {
    try {
      navigator.webkitGetUserMedia({audio:true, video:true}, onUserMediaSuccess,
                                   onUserMediaError);
      console.log("Requested access to local media with new syntax.");
    } catch (e) {
      try {
        navigator.webkitGetUserMedia("video,audio", onUserMediaSuccess,
                                     onUserMediaError);
        console.log("Requested access to local media with old syntax.");
      } catch (e) {
        alert("webkitGetUserMedia() failed. Is the MediaStream flag enabled in about:flags?");
        console.log("webkitGetUserMedia failed with exception: " + e.message);
      }
    }
}

/**
 * Set parameter for creating a peer connection and add a callback function for messagin by peer connection
 * @return {void}
 */
createPeerConnection = function() {
  try {
    pc = new webkitPeerConnection00(pc_config, onIceCandidate);
    console.log("Created webkitPeerConnnection00 with config \""+ pc_config +"\".");
  } catch (e) {
    console.log("Failed to create PeerConnection, exception: " + e.message);
    alert("Cannot create PeerConnection object; Is the 'PeerConnection' flag enabled in about:flags?");
    return;
  }

  pc.onconnecting = onSessionConnecting;
  pc.onopen = onSessionOpened;
  pc.onaddstream = onRemoteStreamAdded;
  pc.onremovestream = onRemoteStreamRemoved;  
}

/**
 * Verify all parameters and start the peer connection and add the stream to this peer connection
 * @return {void}
 */
maybeStart = function() {
    if (!started && localStream && channelReady) {      
        setStatus("Connecting..."); 
        console.log("Creating PeerConnection.");
        createPeerConnection();  
        console.log("Adding local stream.");      
        pc.addStream(localStream);
        started = true;
        // Caller initiates offer to peer.
        if (initiator)
          doCall();
    }
}

/**
 * Set the footer
 * @param {string} state : string to be placed in the footer
 */
setStatus = function(state) {
    $('#footer').html(state);
}

function doCall() {
  console.log("Send offer to peer");
  var offer = pc.createOffer({audio:true, video:true});
  pc.setLocalDescription(pc.SDP_OFFER, offer);
  sendMessage({type: 'offer', sdp: offer.toSdp()});
  pc.startIce();
}

function doAnswer() {
  console.log("Send answer to peer");
  var offer = pc.remoteDescription;
  var answer = pc.createAnswer(offer.toSdp(), {audio:true,video:true});
  pc.setLocalDescription(pc.SDP_ANSWER, answer);
  sendMessage({type: 'answer', sdp: answer.toSdp()});
  pc.startIce();
}

function sendMessage(message) {
  var msgString = JSON.stringify(message);
  console.log('C->S: ' + msgString);
  socket.send(msgString);
}

function processSignalingMessage(message) {
  var msg = JSON.parse(message);

  if (msg.type === 'offer') {
    // Callee creates PeerConnection
    if (!initiator && !started)
      maybeStart();

    pc.setRemoteDescription(pc.SDP_OFFER, new SessionDescription(msg.sdp));
    checkIceFormat(msg.sdp);
    doAnswer();
  } else if (msg.type === 'answer' && started) {
    pc.setRemoteDescription(pc.SDP_ANSWER, new SessionDescription(msg.sdp));
    checkIceFormat(msg.sdp);
  } else if (msg.type === 'candidate' && started) {
    var candidateString = maybeAddIceCredentials(msg);
    var candidate = new IceCandidate(msg.label, candidateString);
    pc.processIceMessage(candidate);
  } else if (msg.type === 'bye' && started) {
    onRemoteHangup();
  }
}

// Temp solution for compatibility between Chrome 20 and later versions.
// We need to convert the ICE candidate into old format at Chrome 20 end.
function checkIceFormat(msgString) {
  var ua = navigator.userAgent;
  if (ua.substr(ua.lastIndexOf('Chrome/')+7, 2) === '20') {
    // If the offer/answer is from later Chrome to Chrome 20
    // Save the username and password of both audio and video
    if (msgString.search('ice-ufrag:') !== -1 &&
          msgString.search('ice-pwd:') !== -1) {
      saveIceCredentials(msgString);
      needFormatCandidate = true;
    }
  }
}

// Save the ICE credentials in SDP from later Chrome at Chrome 20 end.
function saveIceCredentials(msgString) {
  var indexOfAudioSdp = msgString.search('m=audio');
  var indexOfVideoSdp = msgString.search('m=video');

  // Candidate label 0 for audio, 1 for video
  var audioSdp = msgString.substring(indexOfAudioSdp, indexOfVideoSdp);
  iceUfrags[0] = audioSdp.substr(audioSdp.search('ice-ufrag:')+10, 16);
  icePwds[0] = audioSdp.substr(audioSdp.search('ice-pwd:')+8, 24);
  var videoSdp = msgString.substring(indexOfVideoSdp);
  iceUfrags[1] = videoSdp.substr(videoSdp.search('ice-ufrag:')+10, 16);
  icePwds[1] = videoSdp.substr(videoSdp.search('ice-pwd:')+8, 24);
}


// Add saved ICE credentials into candidate from later Chrome at Chrome 20 end.
function maybeAddIceCredentials(msg) {
  var candidateString = msg.candidate;
  if (needFormatCandidate) {
    candidateString = msg.candidate.replace('generation',
                                            'username ' + iceUfrags[msg.label] +
                                            ' password ' + icePwds[msg.label] +
                                            ' generation');
  }
  return candidateString;
}

/**
 * Called when the channel with the server is opened
 * if you're the initiator the connection is establishing by calling maybeStart()
 * @return {void}
 */
onChannelOpened = function() {    
    console.log('Channel opened.');
    channelReady = true;
    if (initiator) maybeStart();
}

/**
 * Called when the client receive a message from the websocket server
 * @param  {message} message : SDP message
 * @return {void}
 */
onChannelMessage = function(message) {
    console.log('S->C: ' + message);
    processSignalingMessage(message);
}

/**
 * Called when the other client is leaving
 * @return {void}
 */
onChannelBye = function() {
    console.log('Session terminated.');    
    remoteVideo.css("opacity", "0");
    $("#remotelive").addClass('hide');
    //remoteVideo.attr("src",null);
    initiator = 0;
    started = false;
    setStatus("<div class=\"alert alert-info\">Your partner have left the call.</div>");
}

/**
 * log the error
 * @return {void}
 */
onChannelError = function() {    
    console.log('Channel error.');
}

/**
 * log that the channel is closed
 * @return {[type]}
 */
onChannelClosed = function() {    
    console.log('Channel closed.');
}

/**
 * Callback function for getUserMedia() on success getting the media
 * create an url for the current stream
 * @param  {stream} stream : contains the video and/or audio streams
 * @return {void}
 */
onUserMediaSuccess = function(stream) {
    console.log("User has granted access to local media.");
    url = webkitURL.createObjectURL(stream);
    localVideo.css("opacity", "1");
    $("#locallive").removeClass('hide');
    localVideo.attr("src", url);
    localStream = stream;   
    if (initiator) maybeStart();    
}

/**
 * Callback function for getUserMedia() on fail getting the media
 * @param  {error} error : informations about the error
 * @return {void}
 */
onUserMediaError = function(error) {
    console.log("Failed to get access to local media. Error code was " + error.code);
    alert("Failed to get access to local media. Error code was " + error.code + ".");    
}

/**
 * Function called by the peerConnection method for the signaling process between clients
 * @param  {message} message : generated by the peerConnection API to send SDP message
 * @return {void}
 */

onIceCandidate = function(candidate, moreToFollow) {      
    if (candidate) {
        sendMessage({type: 'candidate',
                     label: candidate.label, candidate: candidate.toSdp()});
    }

    if (!moreToFollow) {
      console.log("End of candidates.");
    }
}

/**
 * Called when the peer connection is connecting
 * @param  {message} message
 * @return {void}
 */
onSessionConnecting = function(message) {      
    console.log("Session connecting.");
}

/**
 * Called when the session between clients is established
 * @param  {message} message
 * @return {void}
 */
onSessionOpened = function(message) {      
    console.log("Session opened.");
}

/**
 * Get the remote stream and add it to the page with an url
 * @param  {event} event : event given by the browser
 * @return {void}
 */
onRemoteStreamAdded = function(event) {   
    console.log("Remote stream added.");
    var url = webkitURL.createObjectURL(event.stream);
    remoteVideo.css("opacity", "1");
    $("#remotelive").removeClass('hide');
    remoteVideo.attr("src", url);
    setStatus("<div class=\"alert alert-success\">Is currently in video conference <button id=\"hangup\" class=\"btn btn-mini btn-danger pull-right\" onclick=\"onHangup()\">Hang Up</button></div>");
}

/**
 * Called when the remote stream has been removed
 * @param  {event} event : event given by the browser
 * @return {void}
 */
onRemoteStreamRemoved = function(event) {   
    console.log("Remote stream removed.");
}

/**
 * Call when the user click on the "Hang Up" button
 * Close the peerconnection and tells to the websocket server you're leaving
 * @return {void}
 */
onHangup = function() {
    console.log("Hanging up.");    
    localVideo.css("opacity", "0");    
    remoteVideo.css("opacity", "0");
    $("#locallive").addClass('hide');
    $("#remotelive").addClass('hide');    
    stop();
    socket.emit("exit");
    setStatus("<div class=\"alert alert-info\">You have left the call.</div>");    
}

function onRemoteHangup() {
  console.log('Session terminated.');
  stop();
  initiator = 0;
}

function stop() {
  started = false;
  needFormatCandidate = false;
  pc.close();
  pc = null;
}