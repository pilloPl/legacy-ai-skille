package io.pillopl.party;

import java.util.Objects;
import java.util.UUID;

/**
 * A named relationship from one party to another.
 */
public record PartyRelationship(UUID id, PartyId from, PartyId to, RelationshipName name) {

    public PartyRelationship {
        Objects.requireNonNull(id, "id cannot be null");
        Objects.requireNonNull(from, "from cannot be null");
        Objects.requireNonNull(to, "to cannot be null");
        Objects.requireNonNull(name, "name cannot be null");
    }

    static PartyRelationship of(PartyId from, PartyId to, RelationshipName name) {
        return new PartyRelationship(UUID.randomUUID(), from, to, name);
    }

    /**
     * EXAMPLE names from one run — replace them with the relationships from the specification's mapping dictionary.
     */
    public enum RelationshipName {
        /** issuer sub-group → issuer organization above it */
        SUBGROUP_OF,
        /** card issuer → campsite where its cards are accepted */
        ACCEPTANCE_AGREEMENT
    }
}
