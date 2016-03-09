# Node SMB Server

A 100% javascript implementation of the [SMB][] file sharing protocol.

## Current Status

* Implements CIFS and MS-SMB 1.0. 
* Tested with Finder on OS X (Yosemite, El Capitan).
* Support for SMB2 is currently work in progress. 

## ToDo's

* Test with other clients on other platforms (Windows, Linux).
* Test cases/suite

CIFS/SMB:

* missing NT_TRANSACT subcommands
* missing TRANSACTION2 subcommands (e.g. TRANS2_QUERY_FILE_INFORMATION)
* missing TRANSACTION2 subcommand information levels
* missing TRANSACTION subcommands
* missing CIFS commands:
  * TRANSACTION_SECONDARY
  * TRANSACTION2_SECONDARY
  * NT_TRANSACT_SECONDARY
  * OPEN_PRINT_FILE
* support for named streams?
* SMB Signing?
* proper implementation of LOCKING_ANDX?
* missing MS-SMB 1.0 command extensions?

Check/Implement the following protocol extensions/versions:

* SMB2/3

[SMB]: http://en.wikipedia.org/wiki/Server_Message_Block