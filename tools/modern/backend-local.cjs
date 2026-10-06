// The production server listens on PORT without a host. Bind this local run to loopback.
const http = require('node:http');
const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function(port, ...rest) {
  if (Number(port) === Number(process.env.PORT || 8097) && (rest.length === 0 || typeof rest[0] === 'function')) {
    return listen.call(this, port, '127.0.0.1', ...rest);
  }
  return listen.call(this, port, ...rest);
};
require('../../server/server.js');
