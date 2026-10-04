# Equipment compatibility and recovery

Equipment rules are shared with the web client in `../equipment-rules.js`.
An enchanted piece carries its identity, forge level and up to three affixes in
its key: `BASE_PLUS_N~12hexidentity~h25.c7.b5`. Keep the entire key through saves,
chests, ground drops, trade and auctions. Individual enchanted pieces use quantity 1.
Legacy plain equipment keys and forge effects remain supported.

## Operational recovery

Set `ENCHANTING_ENABLED=0` and redeploy the current compatible backend to pause
new enchanting operations. Existing equipment, bonuses and saved operation
receipts continue to work. The client reports maintenance and disables new rolls.
Set the flag to `1` to re-enable them after the affected implementation is fixed.

**Do not roll the complete server or client back to a version predating this
equipment parser after enchanted pieces have been created.** Such versions cannot
interpret the saved keys. Retain the parser, item art normalization, bonuses and
transport compatibility when reverting other behavior. Disabling the feature
does not remove items or their bonuses and requires no save migration.

An `invEnchant` request uses the server-issued `enchantToken` as its `opId`.
Successful operations save inventory, equipment, gold, result and a rotated token
before acknowledging. The last 20 receipts permit replay of the original result;
older consumed tokens are rejected without consuming anything. The client stores
pending requests per account to recover after a reload using the same token.

Release verification covered forging an enchanted piece, individual bonus rolls,
lost acknowledgement and reload, chest reopening, auction/backend restart,
legacy-client save rejection, receipt eviction and restart with the feature
disabled. Unit tests: `node --test server/test/equipment-rules.test.cjs`.
