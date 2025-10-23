import requests
import json
import time

API_URL = 'http://localhost:3000'

# Get all events
response = requests.get(f'{API_URL}/events')
events = response.json()['events']

# Filter and show relevant events
print("Recent bot events:")
print("-" * 50)

for event in events[-20:]:  # Show last 20 events
    if event['type'] in ['death', 'respawn_attempt', 'spawn', 'reconnect', 'chat', 'health']:
        timestamp = event['timestamp']
        event_type = event['type']
        data = event['data']
        print(f"{event_type}: {json.dumps(data, indent=2)}")

# Check current state
print("\n" + "-" * 50)
print("Current bot state:")
try:
    response = requests.get(f'{API_URL}/state')
    state = response.json()
    print(f"Health: {state['health']}/20")
    print(f"Food: {state['food']}/20")
    print(f"Position: {state['position']}")
    print(f"Game Mode: {state['gameMode']}")
    print("\nBot is alive and connected! ✓")
except Exception as e:
    print(f"Error getting state: {e}")
    print("Bot may be disconnected")