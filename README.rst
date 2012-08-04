WebRTC Sample
=============


requirements
-------------

You have to install 

- node.js 
- python and virtualenv
- Chrome or Chromium (please use the latest version of Chrome/Chromium Dev or Chrome Canary)


setup web server
----------------

sudo apt-get install python-virtualenv
virtualenv env
source env/bin/activate
pip install -r requirements.txt


run web server
--------------

python app/__init__.py


setup signaling server
----------------------

sudo apt-get install node


run signanling server
---------------------

node nodejs_server/index.js


credits
-------

Inspired by https://apprtc.appspot.com/ and Prototype WebRTC Project