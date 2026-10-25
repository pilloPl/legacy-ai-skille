package io.pillopl.party;

import java.util.Objects;
import java.util.Set;

/**
 * A party with the roles it plays. Kind tells an organization from its unit and from a person.
 */
public record Party(PartyId id, PartyKind kind, String name, Set<Role> roles) {

    public Party {
        Objects.requireNonNull(id, "PartyId cannot be null");
        Objects.requireNonNull(kind, "Kind cannot be null");
        roles = Set.copyOf(roles);
    }

    public boolean plays(Role role) {
        return roles.contains(role);
    }

    public enum PartyKind {
        ORGANIZATION, ORGANIZATION_UNIT, PERSON
    }
}
