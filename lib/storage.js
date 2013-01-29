var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var crypto = require('./crypto')
var rsa = require('./crypto/rsa')
var API = require('./api').API
var File = require('./file').File

exports.Storage = Storage

Storage.NODE_TYPE_FILE = 0
Storage.NODE_TYPE_DIR = 1
Storage.NODE_TYPE_DRIVE = 2
Storage.NODE_TYPE_INBOX = 3
Storage.NODE_TYPE_RUBBISH_BIN = 4

function Storage(email, pass, cb) {
  if (arguments.length === 1 && typeof email === 'function') {
    cb = email
    email = null
  }

  this.api = new API()
  this._files = {}

  if (email) {
    this.email = email
    var pw = crypto.prepare_key(new Buffer(pass))
    var aes = new crypto.AES(pw)
    var uh = aes.stringhash(new Buffer(email))
    var self = this
    this.api.request({a: 'us', user: email, uh: uh}, function(err, response) {
      console.log('resp', response)
      self.key = new Buffer(crypto.formatKey(response.k))
      aes.decryptKey(self.key)
      self.aes = new crypto.AES(self.key)

      var t = rsa.mpi2b(crypto.formatKey(response.csid).toString('binary'))
      var privk = self.aes.decryptKey(crypto.formatKey(response.privk)).toString('binary')

      var r = false
      var rsa_privk = Array(4);

      // decompose private key
      for (var i = 0; i < 4; i++)
      {
        var l = ((privk.charCodeAt(0)*256+privk.charCodeAt(1)+7)>>3)+2;
        rsa_privk[i] = rsa.mpi2b(privk.substr(0,l));
        if (typeof rsa_privk[i] == 'number') break;
        privk = privk.substr(l);
      }

      var sid = new Buffer(rsa.b2s(rsa.RSAdecrypt(t,rsa_privk[2],rsa_privk[0],rsa_privk[1],rsa_privk[3])).substr(0,43), 'binary')
      sid = crypto.base64Addons(sid.toString('base64'))

      self.api.sid = self.sid = sid
      self.RSAPrivateKey = rsa_privk


      console.log('sessionid', sid)

      self.api.request({a: 'ug'}, function(err, response) {
        console.log('user', response)
        self.name = response.name
        self.user = response.u

        self.api.request({a: 'f', c: 1}, function(err, response) {
          response.f.forEach(function(f) {
            if (!self._files[f.h]) {
              var fo = self._files[f.h] = new File(f, storage)
              if (f.t === Storage.NODE_TYPE_DRIVE) {
                self.root = fo
              }
              if (f.t === Storage.NODE_TYPE_RUBBISH_BIN) {
                self.trash = fo
              }
              if (f.t === Storage.NODE_TYPE_INBOX) {
                self.inbox = fo
              }
              if (f.p) {
                var parent = self._files[f.p]
                if (!parent.children) parent.children = []
                parent.children.push(fo)
                fo.parent = parent
              }
            }
          })
          console.log('files', response)
        })

      })



   })
    // key from passworf
    // hash email using key
    // api request
  }

  this.status = 'connecting'
}
inherits(Storage, EventEmitter)