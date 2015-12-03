# SMB Server

A 100% javascript implementation of the [SMB][] file sharing protocol.

## ToDo's

CIFS:

* Extended Security/SMB Signing
* missing NT_TRANSACT subcommands
* missing TRANSACTION2 subcommands (e.g. TRANS2_QUERY_FILE_INFORMATION)
* missing TRANSACTION2 subcommand information levels
* missing CIFS commands:
  * TRANSACTION and subcommands
  * TRANSACTION_SECONDARY
  * TRANSACTION2_SECONDARY
  * NT_TRANSACT_SECONDARY
  * OPEN_PRINT_FILE
* enum shares (DCE/RPC over SMB named pipes)
* proper implementation of LOCKING_ANDX ?

Check/Implement the following protocol extensions/versions:

* MS-SMB 1.0 (CIFS extension)
* SMB2/3

[SMB]: http://en.wikipedia.org/wiki/Server_Message_Block