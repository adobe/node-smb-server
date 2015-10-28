# SMB Server

A 100% javascript implementation of the [SMB][] file sharing protocol.

## ToDo's

CIFS:

* Extended Security/SMB Signing
* NT_TRANSACT_NOTIFY_CHANGE
* LOCKING_ANDX
* NT_TRANSACT_SECONDARY, TRANSACTION2_SECONDARY
* missing TRANSACTION2 subcommand information levels

Check/Implement the following protocol extensions/versions:

* MS-SMB 1.0 (extends CIFS)
* SMB2/3

[SMB]: http://en.wikipedia.org/wiki/Server_Message_Block