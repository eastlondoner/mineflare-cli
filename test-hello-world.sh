#!/bin/bash

# Read the hello-world.js file and prepare it for JSON
SOURCE=$(cat examples/programs/hello-world.js | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')

# Send the request to register and run the program
curl -X POST http://localhost:3000/program/register \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"hello-test-$(date +%s)\",
    \"source\": \"$SOURCE\"
  }"

echo ""
echo "Program registered. Now running it..."

# Run the program
PROGRAM_NAME="hello-test-$(date +%s)"
curl -X POST http://localhost:3000/program/run \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$PROGRAM_NAME\",
    \"args\": {\"message\": \"Hello from test!\"}
  }"