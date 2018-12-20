# Instructions
Run NPM install  
Start up the program with 'node main.js'  

# How to run app  
-LND, Shock, Static, Mobile   

# Websockets  
When the app starts up shock/src/sockets.js initializes the staticClient  
by passing in lightning client & a socket when the mobile app creates   
a connection with the shock service.   

When the staticClient initializes, it calls a number of functions, one
key, it then sends the pub key to the static service. It receives an   
ack event that  confirms registration.

At this point the mobile client has connected to the shock service via   
web sockets, and the shock service has connected to the static service   
via web sockets. Now we are ready to make invoice requests and respond   
to invoice requests.   
