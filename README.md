# SMB Server

A 100% javascript implementation of the [SMB][] file sharing protocol.

## ToDo's

CIFS:

* Extended Security/SMB Signing
* missing NT_TRANSACT subcommands (e.g. NT_TRANSACT_NOTIFY_CHANGE)
* proper implementation of LOCKING_ANDX
* missing TRANSACTION2 subcommand information levels
* missing CIFS commands:
  * CHECK_DIRECTORY
  * TRANSACTION
  * TRANSACTION_SECONDARY
  * OPEN_ANDX
  * TRANSACTION2_SECONDARY
  * FIND_CLOSE2
  * NT_TRANSACT_SECONDARY
  * NT_CANCEL
  * OPEN_PRINT_FILE

Check/Implement the following protocol extensions/versions:

* MS-SMB 1.0 (CIFS extension)
* SMB2/3

[SMB]: http://en.wikipedia.org/wiki/Server_Message_Block