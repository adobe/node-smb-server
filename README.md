# SMB Server for Node.js

## Overwiew

**node-smb-server** is an open-source JavaScript implementation of the [SMB/CIFS][] file sharing protocol. 

Some highlights:

* pure JavaScript
* fully configurable/customizable
* extensible: allows to expose non-filesystem based data as a mountable file system via an abstract backend SPI (similar to Samba's VFS) 

## Installation

```
npm install node-smb-server
```
or 
```
git clone https://github.com/adobe/node-smb-server.git
cd node-smb-server
npm install
```

## Getting started

Execute the following commands in a terminal:
```
cd <node-smb-server install dir>
npm start
```

In Finder, open the 'Connect to Server' dialog (⌘K) and enter the url `smb://localhost:8445/fs` (user: `test`, password: `test`).

## Getting your hands dirty

### User management

The following users are pre-configured: `test/test`, `admin/admin`, `guest/<empty password>`

Users can be edited in the `config.json` file:
```
...
"users" : {
    "test" : {
      "lmHash" : "01fc5a6be7bc6929aad3b435b51404ee",
      "ntlmHash" : "0cb6948805f797bf2a82807973b89537"
    },
    "admin" : {
      "lmHash" : "f0d412bd764ffe81aad3b435b51404ee",
      "ntlmHash" : "209c6174da490caeb422f3fa5a7ae634"
    },
    "guest" : {
      "lmHash" : "aad3b435b51404eeaad3b435b51404ee",
      "ntlmHash" : "31d6cfe0d16ae931b73c59d7e0c089c0"
    }
  }
...
```

Password hashes can be computed by running:
```
node createhash.js
```

### Share configuration

Share configurations can be edited in the `config.json` file, e.g.:
```
...
 "shares": {
    "FS": {
      "backend": "fs",
      "description": "fs-based test share",
      "path": "./smbroot"
    },
    "JCR": {
      "backend": "jcr",
      "description": "AEM-based test share",
      "host": "localhost",
      "port": 4502,
      "protocol": "http:",
      "auth": {
        "user": "<user>",
        "pass": "<pwd>"
      },
      "path": "/",
      "maxSockets": 64,
      "contentCacheTTL": 30000,
      "binCacheTTL": 600000
    },
...
```

### Developing a custom backend

Consider the following example use case:

*You would like to enable your desktop applications to access data and documents stored in a RDBMS or a Cloud-based service.*

You could write a custom backend by implementing the `Share`, `Tree` and `File` interfaces of the virtual backend SPI (`lib/spi`). Check out the existing implementations (`lib/backends`) to get an idea.  

## Current Status

* Implements CIFS and MS-SMB 1.0.
* Support for SMB2 is currently work in progress.
* Supports LM, LMv2, NTLM, NTLMSSP authentication protocols
* Supported backends:
    * local file system (`lib/backends/fs`)
    * JCR (`lib/backends/jcr`)
    * AEM Assets (`lib/backends/dam`)
* Tested with Finder on OS X (Yosemite, El Capitan, Sierra).

## ToDo's

* Test with other clients on other platforms (Windows, Linux).
* Test cases/suite

CIFS/SMB:

* missing NT_TRANSACT subcommands
* missing TRANSACTION subcommands
* missing TRANSACTION2 subcommand information levels
* missing CIFS commands:
  * TRANSACTION_SECONDARY
  * TRANSACTION2_SECONDARY
  * NT_TRANSACT_SECONDARY
  * OPEN_PRINT_FILE
* support for named streams?
* SMB Signing?
* proper implementation of LOCKING_ANDX?

Check/Implement the following protocol extensions/versions:

* SMB2/3

[SMB/CIFS]: http://en.wikipedia.org/wiki/Server_Message_Block

## Contributing

If you are interested in contributing to this project, check out our [contribution guidelines](CONTRIBUTING.md)!
