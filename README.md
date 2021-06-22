# SMB Server for Node.js

**:warning: This repository is no longer actively maintained.**

## Overwiew

**node-smb-server** is an open-source JavaScript implementation of the [SMB/CIFS](https://en.wikipedia.org/wiki/Server_Message_Block#SMB_/_CIFS_/_SMB1) file sharing protocol.

Some highlights:

* pure JavaScript
* fully configurable/customizable
* extensible: allows to expose non-filesystem based data as a mountable file system via an abstract backend SPI (similar to Samba's VFS)

> **Note**:
>
> The current implementation works with **Finder** on **OS X** (Yosemite, El Capitan, Sierra). More recent OS X versions might work as well but they haven't been tested.
>
>**Windows** is not supported. **File Explorer** only supports the standard SMB port `445`. It's virtually impossible to run a custom SMB server listening on port `445` on Windows. See [here](https://github.com/adobe/node-smb-server/issues/3#issuecomment-349855169) and [here](https://github.com/adobe/node-smb-server/issues/6#issuecomment-304242562) for related discussions. 




## Installation

```bash
npm install node-smb-server
```

or

```bash
git clone https://github.com/adobe/node-smb-server.git
cd node-smb-server
npm install
```

## Getting started

Execute the following commands in a terminal:

```bash
cd <node-smb-server install dir>
npm start
```

In Finder, open the 'Connect to Server' dialog (⌘K) and enter the url `smb://localhost:8445/fs` (user: `test`, password: `test`).

## Getting your hands dirty

### User management

The following users are pre-configured: `test/test`, `admin/admin`, `guest/<empty password>`

Users can be edited in the `config.json` file:

```json
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

```bash
node createhash.js
```

### Share configuration

Share configurations can be edited in the `config.json` file, e.g.:

```json
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

* Implements **CIFS** and **MS-SMB 1.0**.
* Support for **SMB2** is currently work in progress.
* Supports **LM**, **LMv2**, **NTLM**, **NTLMSSP** authentication protocols
* Supported backends:
  * local file system (`lib/backends/fs`)
  * [JCR](http://jackrabbit.apache.org/jcr/jcr-api.html) (`lib/backends/jcr`)
  * [AEM Assets](https://helpx.adobe.com/experience-manager/6-3/assets/using/mac-api-assets.html) (`lib/backends/dam`)
* Tested with Finder on OS X (Yosemite, El Capitan, Sierra).

## ToDo's

* Test with other clients on other platforms (Windows, Linux).
* Test cases/suite

### **CIFS/SMB**

* missing `NT_TRANSACT` subcommands
* missing `TRANSACTION` subcommands
* missing `TRANSACTION2` subcommand information levels
* missing CIFS commands:
  * `TRANSACTION_SECONDARY`
  * `TRANSACTION2_SECONDARY`
  * `NT_TRANSACT_SECONDARY`
  * `OPEN_PRINT_FILE`
* support for named streams?
* SMB Signing?
* proper implementation of `LOCKING_ANDX`?

### **SMB Versions 2 and 3**

Check/Implement the following protocol extensions/versions:

* [SMB v2](https://en.wikipedia.org/wiki/Server_Message_Block#SMB_2.0)
* [SMB v3](https://en.wikipedia.org/wiki/Server_Message_Block#SMB_3.0)

## Specifications

* [MS-CIFS: Common Internet File System (CIFS) Protocol](https://msdn.microsoft.com/en-us/library/ee442092.aspx)
* [MS-SMB: Server Message Block (SMB) Protocol](https://msdn.microsoft.com/en-us/library/cc246231.aspx)
* [MS-SMB2: Server Message Block (SMB) Protocol Versions 2 and 3](https://msdn.microsoft.com/en-us/library/cc246482.aspx)

## Contributing

If you are interested in contributing to this project, check out our [contribution guidelines](CONTRIBUTING.md)!
