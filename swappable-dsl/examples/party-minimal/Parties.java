package io.pillopl.party;

import io.pillopl.party.Party.PartyKind;
import io.pillopl.party.PartyRelationship.RelationshipName;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Parties and their relationships, kept in memory (hypothesis: no persistence yet).
 */
public class Parties {

    private final Map<PartyId, Party> parties = new ConcurrentHashMap<>();
    private final List<PartyRelationship> relationships = new ArrayList<>();

    public Party register(PartyKind kind, String name, Role... roles) {
        Party party = new Party(PartyId.random(), kind, name, Set.of(roles));
        parties.put(party.id(), party);
        return party;
    }

    public Optional<Party> find(PartyId id) {
        return Optional.ofNullable(parties.get(id));
    }

    public synchronized PartyRelationship relate(PartyId from, PartyId to, RelationshipName name) {
        PartyRelationship relationship = PartyRelationship.of(from, to, name);
        relationships.add(relationship);
        return relationship;
    }

    public synchronized void end(PartyId from, RelationshipName name) {
        relationships.removeIf(r -> r.from().equals(from) && r.name() == name);
    }

    public synchronized List<PartyRelationship> from(PartyId from, RelationshipName name) {
        return relationships.stream().filter(r -> r.from().equals(from) && r.name() == name).toList();
    }

    public synchronized List<PartyRelationship> to(PartyId to, RelationshipName name) {
        return relationships.stream().filter(r -> r.to().equals(to) && r.name() == name).toList();
    }

    /**
     * The party and every party above it along one relationship (e.g. an issuer and all organizations it is a
     * sub-group of).
     */
    public Set<PartyId> upwards(PartyId start, RelationshipName name) {
        Set<PartyId> seen = new HashSet<>();
        List<PartyId> todo = new ArrayList<>(List.of(start));
        while (!todo.isEmpty()) {
            PartyId current = todo.remove(0);
            if (seen.add(current)) {
                from(current, name).forEach(r -> todo.add(r.to()));
            }
        }
        return seen;
    }
}
