import asyncio

from verify_local import verify

if __name__ == "__main__":
    asyncio.run(verify(cloud=True))
