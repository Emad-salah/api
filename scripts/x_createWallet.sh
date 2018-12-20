#!/bin/bash

# spawn lncli create
spawn lncli create
expect "Input wallet password:"
# # Send the username, and then wait for a password prompt.
# # send "$my_user_id\r"
# send password\r
send [lindex $argv 0]\r
expect "Confirm wallet password:"
# # Send the password, and then wait for a shell prompt.
# send password\r
send [lindex $argv 0]\r
expect "Do you have an existing cipher seed mnemonic you want to use? (Enter y/n):"
# # Send the prebuilt command, and then wait for another shell prompt.
send n\r

expect "Your cipher seed can optionally be encrypted."
send \r
expect "Input your passphrase you wish to encrypt it (or press enter to proceed without a cipher seed passphrase):"
# expect "%"
send \r
# # Capture the results of the command into a variable. This can be displayed, or written to disk.

# set results $expect_out(buffer)

# puts $results
send "exit\r"
# echo $results
# # Exit the telnet session, and wait for a special end-of-file character.
expect eof
