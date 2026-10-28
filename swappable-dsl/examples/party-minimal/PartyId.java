package io.pillopl.party;

import java.util.Objects;
import java.util.UUID;

/**
 * Identity of a party (organization, organization unit, person). Taken from the Party archetype.
 */
public record PartyId(UUID value) {

    public PartyId {
        Objects.requireNonNull(value, "PartyId value cannot be null");
    }

    public static PartyId random() {
        return new PartyId(UUID.randomUUID());
    }
}
