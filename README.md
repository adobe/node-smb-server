# SMB Server

A 100% javascript implementation of the [SMB][] file sharing protocol.

## ToDo's

General:

* separate debug components for SMB and backend (exposed through server object?)

CIFS:

* Extended Security/SMB Signing
* missing NT_TRANSACT subcommands (e.g. NT_TRANSACT_NOTIFY_CHANGE)
* proper implementation of LOCKING_ANDX
* missing TRANSACTION2 subcommand information levels
* missing CIFS commands:
  * CHECK_DIRECTORY
  * OPEN_ANDX
  * TRANSACTION
  * TRANSACTION_SECONDARY
  * TRANSACTION2_SECONDARY
  * NT_TRANSACT_SECONDARY
  * NT_CANCEL
  * OPEN_PRINT_FILE
* enum shares (RPC protocol)

Check/Implement the following protocol extensions/versions:

* MS-SMB 1.0 (CIFS extension)
* SMB2/3

[SMB]: http://en.wikipedia.org/wiki/Server_Message_Block